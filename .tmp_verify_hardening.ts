import {
  addCatalogProduct,
  deleteCatalogProduct,
  getActiveCatalogForAi,
  getCatalogForUser,
  setRuntimePublicBaseUrl,
  updateCatalogProduct,
  updateCatalogSettings
} from './src/lib/db.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { aesEncryptGCM, proto } from '@whiskeysockets/baileys';
import {
  applyBotMessageHKDF,
  askMetaAiViaBaileys,
  attachMetaAiRawSocketHandlers,
  buildMetaAiPrompt,
  cleanMetaAiReply,
  clearMetaAiSession,
  decryptMsmsgCiphertext,
  registerConnectedSocketProvider
} from './src/lib/metaAiService.js';
import { buildBaileysSocketConfig, shutdownBaileysManager } from './src/lib/baileysManager.js';

function encryptMockMsmsg(params: {
  messageSecret: Buffer;
  origMsgId: string;
  origSender: string;
  botJid: string;
  replyText: string;
}) {
  const botSecret = applyBotMessageHKDF(params.messageSecret);
  const useCaseSecret = Buffer.concat([
    Buffer.from(params.origMsgId, 'utf8'),
    Buffer.from(params.origSender, 'utf8'),
    Buffer.from(params.botJid, 'utf8'),
    Buffer.from('', 'utf8')
  ]);
  const aesKey = Buffer.from(crypto.hkdfSync('sha256', botSecret, Buffer.alloc(0), useCaseSecret, 32));
  const iv = crypto.randomBytes(12);
  const aad = Buffer.from(`${params.origMsgId}\u0000${params.botJid}`, 'utf8');
  const encodedProto = proto.Message.encode({
    botInvokeMessage: {
      message: {
        extendedTextMessage: {
          text: params.replyText
        }
      }
    }
  }).finish();
  const encPayload = aesEncryptGCM(Buffer.from(encodedProto), aesKey, iv, aad);
  return { encPayload, encIv: iv };
}

async function run() {
  process.env.JAPRIIN_EPHEMERAL_DB = '1';

  // 1. Verify buildMetaAiPrompt humanization, diversity & strict PII privacy
  const seenPrompts = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const p = buildMetaAiPrompt({
      senderPhone: '6281234567890',
      senderName: 'Luthfi',
      messageBody: 'Kamu ada produk apa saja?',
      customSystemPrompt: 'Gaya bahasa sopan dan ramah.',
      autoReplyRules: [
        { keyword: 'ongkir', response_text: 'Ongkir gratis Jabodetabek untuk pembelian minimal 100rb ya {nama}.' },
        { keyword: 'produk', response_text: 'Semua produk ready dan bisa dikirim hari ini kak.' }
      ],
      catalogShopName: 'Toko Kopi Nusantara',
      catalogProducts: [
        {
          title: 'Kopi Gayo 250g',
          description: 'Single origin roast medium',
          price: 85000,
          image_url: 'https://shop.example.com/api/catalog/images/prod_1234.jpg'
        }
      ]
    });
    assert(!p.includes('Bantu buatkan balasan'), 'Must never contain legacy prompt template');
    assert(!p.includes('Panduan gaya jawab:'), 'Must never contain legacy guidance prefix');
    assert(!p.includes('Pesan dari '), 'Must never leak customer name prefix');
    assert(!p.includes('6281234567890'), 'Prompt must not leak raw customer phone number to Meta AI');
    assert(!p.includes('Luthfi'), 'Prompt must not leak customer name to Meta AI');
    assert(!p.includes('??'), 'Prompt must not contain double question marks');
    assert(p.includes('Kamu ada produk apa saja?'), 'Prompt must preserve customer question');
    assert(p.includes('Kopi Gayo 250g'), 'Prompt must include active catalog item title');
    assert(p.includes('Rp85.000'), 'Prompt must include formatted catalog price');
    assert(p.includes('https://shop.example.com/api/catalog/images/prod_1234.jpg'), 'Prompt must include clickable product photo link');
    assert(p.includes('Gaya bahasa sopan'), 'Prompt must include business style instruction');
    seenPrompts.add(p);
  }
  assert(seenPrompts.size >= 32, `buildMetaAiPrompt should produce wide human variation (got ${seenPrompts.size}/40)`);

  // Verify prompt when catalog is omitted / empty: NO catalog claim appears
  const pNoCatalog = buildMetaAiPrompt({
    senderPhone: '628111222333',
    senderName: 'Sari',
    messageBody: 'Jam buka hari minggu jam berapa?'
  });
  assert(!pNoCatalog.includes('daftar produk'), 'Prompt must NOT mention daftar produk when catalog is empty/disabled');
  assert(!pNoCatalog.includes('katalog'), 'Prompt must NOT mention katalog when catalog is empty/disabled');
  assert(!pNoCatalog.includes('628111222333'));
  assert(!pNoCatalog.includes('Sari'));
  assert(pNoCatalog.includes('Jam buka hari minggu jam berapa?'));

  // 2. Verify cleanMetaAiReply sanitization
  assert.equal(
    cleanMetaAiReply('Tentu! Berikut contoh balasan yang sopan: "Halo kak, stok produk A masih tersedia ya! **Silakan dipesan**."'),
    'Halo kak, stok produk A masih tersedia ya! *Silakan dipesan*.'
  );
  assert.equal(
    cleanMetaAiReply('Halo kak, kami buka setiap hari pukul 08.00 - 21.00 WIB.'),
    'Halo kak, kami buka setiap hari pukul 08.00 - 21.00 WIB.'
  );

  // 3. Verify HKDF + AES-256-GCM msmsg roundtrip
  const secret = crypto.randomBytes(32);
  const origId = 'TEST_MSG_1';
  const origSender = '6281200000001@s.whatsapp.net';
  const botJid = '867051314767696@bot';
  const enc = encryptMockMsmsg({
    messageSecret: secret,
    origMsgId: origId,
    origSender,
    botJid,
    replyText: 'Baik, ini balasannya!'
  });
  const dec = decryptMsmsgCiphertext({
    messageSecret: secret,
    encPayload: enc.encPayload,
    encIv: enc.encIv,
    msgIds: [origId],
    origSenders: [origSender],
    modificationSenders: [botJid]
  });
  assert.equal(dec?.botInvokeMessage?.message?.extendedTextMessage?.text, 'Baik, ini balasannya!');

  // 4. Verify askMetaAiViaBaileys + typing presence + cache + catalog cache invalidation + burst + 463
  const sid = 'test_session_hardening';
  clearMetaAiSession(sid);

  class MockWs extends EventEmitter {
    isOpen = true;
    readyState = 1;
  }
  const ws = new MockWs();
  let relayCount = 0;
  let simulate463 = false;
  const presenceEvents: string[] = [];

  const mockSocket: any = {
    ws,
    user: { id: '628111111111:1@s.whatsapp.net' },
    authState: {
      creds: { me: { id: '628111111111:1@s.whatsapp.net' } },
      keys: { get: async () => ({}) }
    },
    signalRepository: {
      validateSession: async () => ({ exists: true })
    },
    ev: new EventEmitter(),
    sendPresenceUpdate: async (state: string) => {
      presenceEvents.push(state);
    },
    sendReceipt: async () => {},
    sendNode: async () => {},
    query: async (node: any) => {
      if (node?.content?.[0]?.tag === 'bot') {
        return {
          tag: 'iq',
          attrs: { type: 'result' },
          content: [
            {
              tag: 'bot',
              attrs: {},
              content: [{ tag: 'item', attrs: { jid: '867051314767696@bot', persona_id: '867051314767696$760019659443059' } }]
            }
          ]
        };
      }
      return { tag: 'iq', attrs: { type: 'result' }, content: [] };
    },
    getBotListV2: async () => [{ jid: '867051314767696@bot', personaId: '867051314767696$760019659443059' }],
    assertSessions: async () => true,
    relayMessage: async (jid: string, message: any, opts: any) => {
      relayCount++;
      const msgId = opts.messageId;
      if (simulate463) {
        setImmediate(() => {
          ws.emit('CB:ack', {
            tag: 'ack',
            attrs: { class: 'message', id: msgId, from: jid, error: '463' }
          });
        });
        return;
      }
      const mSecret = Buffer.from(message.messageContextInfo.messageSecret);
      const replyPayload = encryptMockMsmsg({
        messageSecret: mSecret,
        origMsgId: msgId,
        origSender: '628111111111@s.whatsapp.net',
        botJid: jid,
        replyText: 'Tentu! Berikut contoh balasannya: "Halo kak, produk masih ready ya **Kak**!"'
      });
      setTimeout(() => {
        ws.emit('CB:message', {
          tag: 'message',
          attrs: { id: `bot_reply_${relayCount}`, from: jid, type: 'text' },
          content: [
            {
              tag: 'meta',
              attrs: { target_id: msgId, target_sender_jid: '628111111111@s.whatsapp.net' }
            },
            {
              tag: 'enc',
              attrs: { v: '2', type: 'msmsg' },
              content: proto.MessageSecretMessage.encode({
                encPayload: replyPayload.encPayload,
                encIv: replyPayload.encIv
              }).finish()
            }
          ]
        });
      }, 20);
    }
  };

  registerConnectedSocketProvider(
    () => ({ sessionId: sid, userId: 'u_test', phoneNumber: '628111111111', socket: mockSocket }),
    () => [{ sessionId: sid, userId: 'u_test', phoneNumber: '628111111111', socket: mockSocket }]
  );
  const detach = attachMetaAiRawSocketHandlers(mockSocket, sid);

  const res1 = await askMetaAiViaBaileys({
    userId: 'u_test',
    sessionId: sid,
    senderPhone: '628777888999',
    senderName: 'Andi',
    messageBody: 'Apakah ready kak?'
  });
  assert.equal(res1.usedAi, true);
  assert.equal(res1.replyText, 'Halo kak, produk masih ready ya *Kak*!');
  assert.equal(relayCount, 1);
  assert(presenceEvents.includes('composing'));
  assert(presenceEvents.includes('paused'));

  const res2 = await askMetaAiViaBaileys({
    userId: 'u_test',
    sessionId: sid,
    senderPhone: '628555444333',
    senderName: 'Citra',
    messageBody: 'Apakah ready kak?'
  });
  assert.equal(res2.usedAi, true);
  assert.equal(relayCount, 1);

  const res2UpdatedCatalog = await askMetaAiViaBaileys({
    userId: 'u_test',
    sessionId: sid,
    senderPhone: '628555444334',
    senderName: 'Dina',
    messageBody: 'Apakah ready kak?',
    catalogProducts: [{ title: 'Jaket Denim', price: 220000, description: 'All size' }]
  });
  assert.equal(res2UpdatedCatalog.usedAi, true);
  assert.equal(relayCount, 2, 'Adding/updating catalogProducts must invalidate stale Meta AI response cache');

  const rA = await askMetaAiViaBaileys({ userId: 'u_test', sessionId: sid, senderPhone: '628000111222', senderName: 'Spammer', messageBody: 'Pertanyaan unik 1' });
  const rB = await askMetaAiViaBaileys({ userId: 'u_test', sessionId: sid, senderPhone: '628000111222', senderName: 'Spammer', messageBody: 'Pertanyaan unik 2' });
  const rC = await askMetaAiViaBaileys({ userId: 'u_test', sessionId: sid, senderPhone: '628000111222', senderName: 'Spammer', messageBody: 'Pertanyaan unik 3' });
  const rD = await askMetaAiViaBaileys({ userId: 'u_test', sessionId: sid, senderPhone: '628000111222', senderName: 'Spammer', messageBody: 'Pertanyaan unik 4' });
  assert.equal(rA.usedAi, true);
  assert.equal(rB.usedAi, true);
  assert.equal(rC.usedAi, true);
  assert.equal(rD.usedAi, false);
  assert.equal(rD.isOfflineFallback, true);
  assert(rD.errorReason?.includes('anti-flood'));

  simulate463 = true;
  const r463 = await askMetaAiViaBaileys({
    userId: 'u_test',
    sessionId: sid,
    senderPhone: '628333444555',
    senderName: 'Budi',
    messageBody: 'Pertanyaan pemicu 463'
  });
  assert.equal(r463.usedAi, false);
  assert(r463.errorReason?.includes('463'));

  const relaysBeforeCooldownHit = relayCount;
  const rAfterCd = await askMetaAiViaBaileys({
    userId: 'u_test',
    sessionId: sid,
    senderPhone: '628333444556',
    senderName: 'Budi',
    messageBody: 'Pertanyaan saat cooldown'
  });
  assert.equal(rAfterCd.usedAi, false);
  assert.equal(relayCount, relaysBeforeCooldownHit);

  detach();
  clearMetaAiSession(sid);

  // 5. Verify buildBaileysSocketConfig resource optimizations
  const cfg = buildBaileysSocketConfig([2, 3000, 1043857760], {} as any, {} as any);
  assert.equal(cfg.connectTimeoutMs, 30000);
  assert.equal(cfg.defaultQueryTimeoutMs, 30000);
  assert.equal(cfg.maxMsgRetryCount, 2);
  assert.equal(cfg.syncFullHistory, false);
  assert.equal(cfg.markOnlineOnConnect, false);
  assert.equal(cfg.shouldSyncHistoryMessage(), false);
  assert.equal(cfg.shouldIgnoreJid('867051314767696@bot'), false);
  assert.equal(cfg.shouldIgnoreJid('123456@g.us'), true);
  assert.equal(cfg.shouldIgnoreJid('status@broadcast'), true);

  // 6. Verify Multi-Tenant Mini Shop Catalog CRUD, IDOR Isolation, & URL Resolution
  setRuntimePublicBaseUrl('https://demo.japriin.test');
  const expectedBase = (await import('./src/lib/db.js')).resolvePublicAppBaseUrl();
  assert(expectedBase.startsWith('http://') || expectedBase.startsWith('https://'));
  const ownerA = 'user_tenant_a';
  const ownerB = 'user_tenant_b';

  // Initially disabled and empty
  assert.equal(getActiveCatalogForAi(ownerA).enabled, false);
  assert.equal(getActiveCatalogForAi(ownerA).products.length, 0);

  const prodA = addCatalogProduct(ownerA, {
    title: 'Sepatu Lari Pro',
    description: 'Ringan dan empuk ukuran 39-44',
    price: 350000,
    image_url: '/api/catalog/images/prod_abc123.jpg',
    is_active: true
  });

  // Still disabled until owner enables catalog toggle
  assert.equal(getActiveCatalogForAi(ownerA).enabled, false);

  updateCatalogSettings(ownerA, { enabled: true, shop_name: 'Sporty ID' });
  const activeA = getActiveCatalogForAi(ownerA);
  assert.equal(activeA.enabled, true);
  assert.equal(activeA.shopName, 'Sporty ID');
  assert.equal(activeA.products.length, 1);
  assert.equal(activeA.products[0].image_url, `${expectedBase}/api/catalog/images/prod_abc123.jpg`);

  // IDOR test: ownerB cannot update or delete ownerA's product or see ownerA's products
  assert.equal(getCatalogForUser(ownerB).products.length, 0);
  assert.equal(updateCatalogProduct(prodA.id, ownerB, { title: 'Hacked' }), null);
  assert.equal(deleteCatalogProduct(prodA.id, ownerB), null);
  assert.equal(getCatalogForUser(ownerA).products[0].title, 'Sepatu Lari Pro');

  // Toggling product inactive hides it from AI
  updateCatalogProduct(prodA.id, ownerA, { is_active: false });
  assert.equal(getActiveCatalogForAi(ownerA).enabled, false);

  // Deleting with rightful owner works
  const deletedA = deleteCatalogProduct(prodA.id, ownerA);
  assert.equal(deletedA?.id, prodA.id);
  assert.equal(getCatalogForUser(ownerA).products.length, 0);

  shutdownBaileysManager();
  console.log('ALL HARDENING, CATALOG & RESOURCE OPTIMIZATION CHECKS PASSED');
  process.exit(0);
}

run().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
