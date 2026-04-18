(function () {
  'use strict';

  const bubbleEl = document.getElementById('bubble');
  const bubbleTextEl = document.getElementById('bubble-text');

  let hideTimerId = null;
  let isTyping = false;

  function setChatVisible(visible) {
    if (window.pet && window.pet.setChatVisible) {
      window.pet.setChatVisible(visible);
    }
  }

  function showBubbleText(text) {
    if (hideTimerId) {
      clearTimeout(hideTimerId);
      hideTimerId = null;
    }
    isTyping = false;
    bubbleEl.classList.remove('hidden', 'typing');
    bubbleTextEl.textContent = text;
    setChatVisible(true);

    hideTimerId = setTimeout(hideBubble, 6000);
  }

  function showBubbleStreaming() {
    if (hideTimerId) {
      clearTimeout(hideTimerId);
      hideTimerId = null;
    }
    isTyping = true;
    bubbleEl.classList.remove('hidden');
    bubbleEl.classList.add('typing');
    bubbleTextEl.textContent = '';
    setChatVisible(true);
  }

  function appendBubbleText(text) {
    bubbleTextEl.textContent += text;
  }

  function finishBubble() {
    bubbleEl.classList.remove('typing');
    isTyping = false;
    hideTimerId = setTimeout(hideBubble, 6000);
  }

  function hideBubble() {
    bubbleEl.classList.add('hidden');
    bubbleEl.classList.remove('typing');
    bubbleTextEl.textContent = '';
    isTyping = false;
    setChatVisible(false);

    if (hideTimerId) {
      clearTimeout(hideTimerId);
      hideTimerId = null;
    }

    if (window.pet) {
      if (window.pet.enterState) window.pet.enterState('idle');
      if (window.pet.scheduleNextAction) window.pet.scheduleNextAction();
    }
  }

  function typewriterShow(text) {
    if (hideTimerId) {
      clearTimeout(hideTimerId);
      hideTimerId = null;
    }
    isTyping = true;
    bubbleEl.classList.remove('hidden');
    bubbleEl.classList.add('typing');
    bubbleTextEl.textContent = '';
    setChatVisible(true);

    const chars = [...text];
    let i = 0;
    function next() {
      if (i < chars.length && isTyping) {
        bubbleTextEl.textContent += chars[i++];
        setTimeout(next, 70 + Math.random() * 50);
      } else {
        finishBubble();
      }
    }
    next();
  }

  async function speak(userMessage) {
    const stats = window.pet ? window.pet.getStats() : { hunger: 100, water: 100, mood: 100, energy: 100 };
    showBubbleStreaming();
    window.dogAPI.startChat({ userMessage, stats });

    if (window.pet) window.pet.resetNoInteractTimer();
  }

  window.dogAPI.onChatEvent((event) => {
    switch (event.type) {
      case 'start':
        if (!isTyping) showBubbleStreaming();
        break;
      case 'chunk':
        appendBubbleText(event.text || '');
        break;
      case 'done':
        finishBubble();
        break;
      case 'missing-key':
        typewriterShow('汪？我好像还不会说话...');
        break;
      case 'error': {
        console.error('Chat error:', event.message);
        const fallbacks = ['汪呜... 说话出错了', '呜呜，信号不好呀', '汪！我的话卡住了'];
        typewriterShow(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
        break;
      }
      default:
        break;
    }
  });

  window.chat = { speak, hideBubble, showMessage: showBubbleText };
})();
