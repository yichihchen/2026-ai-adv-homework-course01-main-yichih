const path = require('path');
const fs = require('fs');
const { app, request, registerUser } = require('./setup');
const ecpay = require('../src/lib/ecpay');

describe('ECPay lib', () => {
  it('matches official CheckMacValue test vectors', () => {
    const vectorsPath = path.join(
      __dirname,
      '..',
      '.claude',
      'skills',
      'ecpay',
      'test-vectors',
      'checkmacvalue.json'
    );
    const { vectors } = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));

    const standard = vectors.filter((v) => v.formula !== 'ecticket');
    expect(standard.length).toBeGreaterThan(0);

    for (const v of standard) {
      const result = ecpay.generateCheckMacValue(v.params, v.hashKey, v.hashIV, v.method);
      expect(result).toBe(v.expected);
    }
  });

  it('verifyCheckMacValue accepts a valid CMV and rejects a tampered one', () => {
    const params = {
      MerchantID: '3002607',
      MerchantTradeNo: 'Test1234567890',
      TotalAmount: '100',
    };
    const cmv = ecpay.generateCheckMacValue(params, 'pwFHCqoQZGmho4w6', 'EkRm7iFT261dpevs');
    expect(
      ecpay.verifyCheckMacValue(
        { ...params, CheckMacValue: cmv },
        'pwFHCqoQZGmho4w6',
        'EkRm7iFT261dpevs'
      )
    ).toBe(true);
    expect(
      ecpay.verifyCheckMacValue(
        { ...params, TotalAmount: '999', CheckMacValue: cmv },
        'pwFHCqoQZGmho4w6',
        'EkRm7iFT261dpevs'
      )
    ).toBe(false);
  });

  it('buildAioFormParams returns required ECPay fields for Credit', () => {
    const order = {
      id: 'order-uuid-1',
      order_no: 'ORD-20260513-ABCDE',
      total_amount: 1680,
    };
    const items = [
      { product_name: '粉色玫瑰花束', quantity: 1 },
      { product_name: '白色百合', quantity: 2 },
    ];
    const { actionUrl, fields } = ecpay.buildAioFormParams(order, items);

    expect(actionUrl).toMatch(/AioCheckOut\/V5$/);
    const required = [
      'MerchantID', 'MerchantTradeNo', 'MerchantTradeDate', 'PaymentType',
      'TotalAmount', 'TradeDesc', 'ItemName', 'ReturnURL', 'OrderResultURL',
      'ChoosePayment', 'EncryptType', 'CheckMacValue',
    ];
    for (const k of required) {
      expect(fields[k]).toBeDefined();
      expect(String(fields[k]).length).toBeGreaterThan(0);
    }
    expect(fields.MerchantTradeNo).toBe('ORD20260513ABCDE');
    expect(fields.MerchantTradeNo.length).toBeLessThanOrEqual(20);
    expect(fields.ChoosePayment).toBe('Credit');
    expect(fields.TotalAmount).toBe('1680');
    expect(fields.MerchantTradeDate).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(fields.ItemName).toContain('粉色玫瑰花束');
    expect(fields.ItemName).toContain('#');

    const cfg = ecpay.getConfig();
    const recomputed = ecpay.generateCheckMacValue(
      { ...fields, CheckMacValue: undefined }, cfg.hashKey, cfg.hashIV
    );
    expect(recomputed).toBe(fields.CheckMacValue);
  });

  it('buildAioFormParams returns ATM-specific fields for ATM', () => {
    const order = { id: 'order-uuid-2', order_no: 'ORD-20260513-ATMT', total_amount: 980 };
    const items = [{ product_name: '向日葵花束', quantity: 1 }];
    const { fields } = ecpay.buildAioFormParams(order, items, {}, 'ATM');

    expect(fields.ChoosePayment).toBe('ATM');
    expect(fields.ExpireDate).toBe('7');
    expect(fields.PaymentInfoURL).toContain('/api/payments/ecpay/payment-info');
    expect(fields.OrderResultURL).toBeUndefined();

    const cfg = ecpay.getConfig();
    const recomputed = ecpay.generateCheckMacValue(
      { ...fields, CheckMacValue: undefined }, cfg.hashKey, cfg.hashIV
    );
    expect(recomputed).toBe(fields.CheckMacValue);
  });

  it('buildAioFormParams returns CVS-specific fields for CVS', () => {
    const order = { id: 'order-uuid-3', order_no: 'ORD-20260513-CVST', total_amount: 750 };
    const items = [{ product_name: '鬱金香盆栽', quantity: 1 }];
    const { fields } = ecpay.buildAioFormParams(order, items, {}, 'CVS');

    expect(fields.ChoosePayment).toBe('CVS');
    expect(fields.StoreExpireDate).toBe('4320');
    expect(fields.PaymentInfoURL).toContain('/api/payments/ecpay/payment-info');
    expect(fields.OrderResultURL).toBeUndefined();

    const cfg = ecpay.getConfig();
    const recomputed = ecpay.generateCheckMacValue(
      { ...fields, CheckMacValue: undefined }, cfg.hashKey, cfg.hashIV
    );
    expect(recomputed).toBe(fields.CheckMacValue);
  });
});

describe('ECPay payment routes', () => {
  let userToken;
  let orderId;
  let orderNo;

  beforeAll(async () => {
    const { token } = await registerUser();
    userToken = token;

    const prodRes = await request(app).get('/api/products');
    const productId = prodRes.body.data.products[0].id;

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'pay-test@example.com',
        recipientAddress: '台北市測試路 1 號',
      });
    orderId = orderRes.body.data.id;
    orderNo = orderRes.body.data.order_no;
  });

  it('POST /api/payments/ecpay/checkout/:orderId returns actionUrl + fields', async () => {
    const res = await request(app)
      .post(`/api/payments/ecpay/checkout/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.actionUrl).toMatch(/AioCheckOut\/V5$/);
    expect(res.body.data.fields.MerchantTradeNo).toBe(orderNo.replace(/-/g, ''));
    expect(res.body.data.fields.CheckMacValue).toMatch(/^[0-9A-F]{64}$/);
  });

  it('POST /api/payments/ecpay/checkout/:orderId rejects unauthenticated', async () => {
    const res = await request(app).post(`/api/payments/ecpay/checkout/${orderId}`);
    expect(res.status).toBe(401);
  });

  it('POST /api/payments/ecpay/result rejects bad CheckMacValue', async () => {
    const res = await request(app)
      .post('/api/payments/ecpay/result')
      .type('form')
      .send({
        MerchantID: '3002607',
        MerchantTradeNo: orderNo.replace(/-/g, ''),
        TradeStatus: '1',
        CheckMacValue: 'DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF',
      });
    expect(res.status).toBe(400);
  });

  it('POST /api/payments/ecpay/notify responds 1|OK', async () => {
    const res = await request(app).post('/api/payments/ecpay/notify').send({});
    expect(res.status).toBe(200);
    expect(res.text).toBe('1|OK');
  });

  it('POST /api/payments/ecpay/checkout/:orderId with paymentMethod=ATM returns ATM fields', async () => {
    const { token: token2 } = await registerUser();
    const prodRes = await request(app).get('/api/products');
    const productId = prodRes.body.data.products[0].id;
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token2}`).send({ productId, quantity: 1 });
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token2}`)
      .send({ recipientName: 'ATM測試', recipientEmail: 'atm@test.com', recipientAddress: '台北市' });
    const atmOrderId = orderRes.body.data.id;

    const res = await request(app)
      .post(`/api/payments/ecpay/checkout/${atmOrderId}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ paymentMethod: 'ATM' });

    expect(res.status).toBe(200);
    expect(res.body.data.fields.ChoosePayment).toBe('ATM');
    expect(res.body.data.fields.ExpireDate).toBe('7');
    expect(res.body.data.fields.PaymentInfoURL).toContain('/api/payments/ecpay/payment-info');
    expect(res.body.data.fields.OrderResultURL).toBeUndefined();
    expect(res.body.data.fields.CheckMacValue).toMatch(/^[0-9A-F]{64}$/);
  });

  it('POST /api/payments/ecpay/checkout/:orderId with paymentMethod=CVS returns CVS fields', async () => {
    const { token: token3 } = await registerUser();
    const prodRes = await request(app).get('/api/products');
    const productId = prodRes.body.data.products[0].id;
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token3}`).send({ productId, quantity: 1 });
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token3}`)
      .send({ recipientName: 'CVS測試', recipientEmail: 'cvs@test.com', recipientAddress: '台北市' });
    const cvsOrderId = orderRes.body.data.id;

    const res = await request(app)
      .post(`/api/payments/ecpay/checkout/${cvsOrderId}`)
      .set('Authorization', `Bearer ${token3}`)
      .send({ paymentMethod: 'CVS' });

    expect(res.status).toBe(200);
    expect(res.body.data.fields.ChoosePayment).toBe('CVS');
    expect(res.body.data.fields.StoreExpireDate).toBe('4320');
    expect(res.body.data.fields.PaymentInfoURL).toContain('/api/payments/ecpay/payment-info');
    expect(res.body.data.fields.OrderResultURL).toBeUndefined();
    expect(res.body.data.fields.CheckMacValue).toMatch(/^[0-9A-F]{64}$/);
  });

  it('POST /api/payments/ecpay/payment-info stores ATM info and responds 1|OK', async () => {
    const db = require('../src/database');
    const ecpayLib = require('../src/lib/ecpay');
    const cfg = ecpayLib.getConfig();

    const { token: token4 } = await registerUser();
    const prodRes = await request(app).get('/api/products');
    const productId = prodRes.body.data.products[0].id;
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token4}`).send({ productId, quantity: 1 });
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token4}`)
      .send({ recipientName: '取號測試', recipientEmail: 'info@test.com', recipientAddress: '台北市' });
    const infoOrder = orderRes.body.data;
    const merchantTradeNo = infoOrder.order_no.replace(/-/g, '');

    const payload = {
      MerchantID: cfg.merchantId,
      MerchantTradeNo: merchantTradeNo,
      RtnCode: '2',
      RtnMsg: 'Get CVS(Barcode) Code Successfully',
      TradeNo: 'ECPAY_TRADE_001',
      TradeAmt: String(infoOrder.total_amount),
      PaymentType: 'ATM_BOT',
      TradeDate: '2026/05/14 10:00:00',
      BankCode: '005',
      vAccount: '9876543210123456',
      ExpireDate: '2026/05/21',
    };
    payload.CheckMacValue = ecpayLib.generateCheckMacValue(payload, cfg.hashKey, cfg.hashIV);

    const res = await request(app)
      .post('/api/payments/ecpay/payment-info')
      .type('form')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.text).toBe('1|OK');

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(infoOrder.id);
    expect(updated.payment_info_bank_code).toBe('005');
    expect(updated.payment_info_vaccount).toBe('9876543210123456');
    expect(updated.payment_info_expire_date).toBe('2026/05/21');
    expect(updated.status).toBe('pending');
  });

  it('POST /api/payments/ecpay/payment-info rejects bad CheckMacValue', async () => {
    const res = await request(app)
      .post('/api/payments/ecpay/payment-info')
      .type('form')
      .send({
        MerchantID: '3002607',
        MerchantTradeNo: 'FAKENO',
        RtnCode: '2',
        CheckMacValue: 'DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF',
      });
    expect(res.status).toBe(200);
    expect(res.text).toBe('1|OK');
  });

  it('POST /api/payments/ecpay/query/:orderId triggers QueryTradeInfo and updates order', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      const body = String(init?.body || '');
      expect(url).toMatch(/QueryTradeInfo\/V5$/);
      expect(body).toContain('MerchantTradeNo=' + orderNo.replace(/-/g, ''));
      const respParams = new URLSearchParams({
        MerchantID: '3002607',
        MerchantTradeNo: orderNo.replace(/-/g, ''),
        TradeStatus: '1',
        TradeNo: 'TEST_TRADE_NO_001',
        PaymentDate: '2026/05/13 10:00:00',
        PaymentType: 'Credit_CreditCard',
        TradeAmt: '1680',
      });
      return { ok: true, status: 200, text: async () => respParams.toString() };
    };

    try {
      const res = await request(app)
        .post(`/api/payments/ecpay/query/${orderId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.ecpay_trade_no).toBe('TEST_TRADE_NO_001');
      expect(res.body.data.paid_at).toBe('2026/05/13 10:00:00');
      expect(res.body.data.ecpay_payment_type).toBe('Credit_CreditCard');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
