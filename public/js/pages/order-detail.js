const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    const paymentMessages = {
      success: { text: '付款成功！感謝您的購買。', cls: 'bg-sage/10 text-sage border border-sage/20' },
      failed: { text: '付款失敗，請重試。', cls: 'bg-red-50 text-red-600 border border-red-100' },
      cancel: { text: '付款已取消。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
      pending: { text: '尚未收到付款結果，請點「重新查詢付款狀態」確認。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
    };

    async function simulatePay(action) {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/pay', {
          method: 'PATCH',
          body: JSON.stringify({ action })
        });
        order.value = res.data;
        paymentResult.value = action === 'success' ? 'success' : 'failed';
      } catch (e) {
        Notification.show('付款處理失敗', 'error');
      } finally {
        paying.value = false;
      }
    }

    function handlePaySuccess() { simulatePay('success'); }
    function handlePayFail() { simulatePay('fail'); }

    async function goToEcpay() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/payments/ecpay/checkout/' + order.value.id, {
          method: 'POST'
        });
        const { actionUrl, fields } = res.data;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = actionUrl;
        form.acceptCharset = 'UTF-8';
        for (const [name, value] of Object.entries(fields)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = String(value);
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
      } catch (e) {
        Notification.show(e?.data?.message || '無法前往綠界付款', 'error');
        paying.value = false;
      }
    }

    async function requeryPayment() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/payments/ecpay/query/' + order.value.id, {
          method: 'POST'
        });
        order.value = res.data;
        if (res.data.status === 'paid') {
          paymentResult.value = 'success';
          Notification.show('付款已完成', 'success');
        } else if (res.data.status === 'failed') {
          paymentResult.value = 'failed';
          Notification.show('付款失敗', 'error');
        } else {
          paymentResult.value = 'pending';
          Notification.show('尚未付款', 'info');
        }
      } catch (e) {
        Notification.show(e?.data?.message || '查詢付款狀態失敗', 'error');
      } finally {
        paying.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return {
      order, loading, paying, paymentResult, statusMap, paymentMessages,
      handlePaySuccess, handlePayFail, goToEcpay, requeryPayment
    };
  }
}).mount('#app');
