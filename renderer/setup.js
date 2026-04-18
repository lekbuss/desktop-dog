document.getElementById('link').addEventListener('click', (e) => {
  e.preventDefault();
  window.dogAPI.openExternal('https://console.anthropic.com');
});

document.getElementById('confirm').addEventListener('click', () => {
  const key = document.getElementById('api-key').value.trim();
  window.dogAPI.saveApiKey(key);
  window.dogAPI.closeSetup();
});

document.getElementById('skip').addEventListener('click', () => {
  window.dogAPI.saveApiKey('');
  window.dogAPI.closeSetup();
});

// 回车确认
document.getElementById('api-key').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('confirm').click();
});
