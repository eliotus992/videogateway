import { Hono } from 'hono';
import type { Bindings } from '../worker.js';

const app = new Hono<{ Bindings: Bindings }>();

// Dashboard UI HTML
const dashboardHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VideoGateway Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #fff;
      line-height: 1.6;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      color: #888;
      margin-bottom: 2rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 1.5rem;
      border: 1px solid #333;
    }
    .card h3 {
      font-size: 0.875rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .stat-value {
      font-size: 2.5rem;
      font-weight: bold;
      color: #fff;
    }
    .stat-change {
      font-size: 0.875rem;
      color: #4ade80;
    }
    .providers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }
    .provider-card {
      background: #1a1a1a;
      border-radius: 8px;
      padding: 1rem;
      border: 1px solid #333;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .provider-card.configured {
      border-color: #4ade80;
    }
    .provider-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
    }
    .provider-info {
      flex: 1;
    }
    .provider-name {
      font-weight: 500;
      font-size: 0.9rem;
    }
    .provider-status {
      font-size: 0.75rem;
      color: #888;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4ade80;
    }
    .status-dot.offline {
      background: #ef4444;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover {
      opacity: 0.9;
    }
    .btn-secondary {
      background: #333;
      color: white;
    }
    .section {
      margin-bottom: 2rem;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .section h2 {
      font-size: 1.25rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1a1a1a;
      border-radius: 12px;
      overflow: hidden;
    }
    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid #333;
    }
    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #888;
      font-weight: 500;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .status-completed {
      background: rgba(74, 222, 128, 0.2);
      color: #4ade80;
    }
    .status-processing {
      background: rgba(96, 165, 250, 0.2);
      color: #60a5fa;
    }
    .status-pending {
      background: rgba(250, 204, 21, 0.2);
      color: #facc15;
    }
    .status-failed {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .api-key-input {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .api-key-input input {
      flex: 1;
      padding: 0.75rem;
      background: #333;
      border: 1px solid #444;
      border-radius: 8px;
      color: white;
      font-family: monospace;
    }
    .api-key-input button {
      padding: 0.75rem 1rem;
      background: #4ade80;
      color: #000;
      border: none;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
    }
    .hidden {
      display: none;
    }
    #loading {
      text-align: center;
      padding: 4rem;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 VideoGateway Dashboard</h1>
    <p class="subtitle">管理你的 AI 视频生成服务</p>
    
    <div id="loading">加载中...</div>
    
    <div id="content" class="hidden">
      <!-- 统计卡片 -->
      <div class="grid">
        <div class="card">
          <h3>总生成次数</h3>
          <div class="stat-value" id="total-generations">0</div>
          <div class="stat-change">过去 30 天</div>
        </div>
        <div class="card">
          <h3>成功次数</h3>
          <div class="stat-value" id="completed-count">0</div>
          <div class="stat-change" id="success-rate">成功率 0%</div>
        </div>
        <div class="card">
          <h3>总成本</h3>
          <div class="stat-value" id="total-cost">$0</div>
          <div class="stat-change">USD</div>
        </div>
        <div class="card">
          <h3>待处理</h3>
          <div class="stat-value" id="pending-count">0</div>
          <div class="stat-change">队列中</div>
        </div>
      </div>
      
      <!-- Provider 配置 -->
      <div class="section">
        <div class="section-header">
          <h2>Provider 配置</h2>
          <button class="btn btn-secondary" onclick="refreshProviders()">刷新</button>
        </div>
        <div id="providers-grid" class="providers-grid">
          <!-- 动态生成 -->
        </div>
      </div>
      
      <!-- 最近任务 -->
      <div class="section">
        <div class="section-header">
          <h2>最近生成任务</h2>
          <button class="btn btn-primary" onclick="createGeneration()">+ 新建生成</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>模型</th>
              <th>Provider</th>
              <th>状态</th>
              <th>成本</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody id="recent-tasks">
            <!-- 动态生成 -->
          </tbody>
        </table>
      </div>
      
      <!-- API Key 配置 -->
      <div class="section">
        <h2>API Key</h2>
        <div class="card">
          <p>在你的应用中使用此 API Key 调用 VideoGateway：</p>
          <div class="api-key-input">
            <input type="password" id="api-key-display" value="点击加载" readonly>
            <button onclick="toggleApiKey()">显示</button>
            <button onclick="copyApiKey()">复制</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = window.location.origin;
    let apiKey = localStorage.getItem('vg_api_key') || '';
    let dashboardData = null;
    
    // 初始化
    async function init() {
      if (!apiKey) {
        apiKey = prompt('请输入你的 VideoGateway API Key:');
        if (apiKey) {
          localStorage.setItem('vg_api_key', apiKey);
        }
      }
      
      if (!apiKey) {
        document.getElementById('loading').textContent = '需要 API Key 才能访问 Dashboard';
        return;
      }
      
      await loadDashboard();
    }
    
    // 加载仪表盘数据
    async function loadDashboard() {
      try {
        const response = await fetch(\`\${API_BASE}/v1/dashboard\`, {
          headers: { 'Authorization': \`Bearer \${apiKey}\` }
        });
        
        if (!response.ok) {
          throw new Error('Failed to load dashboard');
        }
        
        dashboardData = await response.json();
        renderDashboard();
      } catch (error) {
        document.getElementById('loading').textContent = '加载失败: ' + error.message;
      }
    }
    
    // 渲染仪表盘
    function renderDashboard() {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('content').classList.remove('hidden');
      
      // 统计
      const usage = dashboardData.usage;
      document.getElementById('total-generations').textContent = usage.total_generations;
      document.getElementById('completed-count').textContent = usage.completed;
      document.getElementById('pending-count').textContent = usage.pending;
      document.getElementById('total-cost').textContent = '$' + (usage.total_cost_usd || 0).toFixed(2);
      
      const successRate = usage.total_generations > 0 
        ? Math.round((usage.completed / usage.total_generations) * 100) 
        : 0;
      document.getElementById('success-rate').textContent = \`成功率 \${successRate}%\`;
      
      // Providers
      renderProviders();
      
      // 最近任务
      renderRecentTasks();
      
      // API Key
      document.getElementById('api-key-display').value = apiKey;
    }
    
    // 渲染 Providers
    function renderProviders() {
      const grid = document.getElementById('providers-grid');
      const providers = dashboardData.providers_status;
      
      grid.innerHTML = providers.map(p => \`
        <div class="provider-card \${p.configured ? 'configured' : ''}">
          <div class="provider-icon">\${getProviderEmoji(p.id)}</div>
          <div class="provider-info">
            <div class="provider-name">\${p.name}</div>
            <div class="provider-status">
              \${p.configured ? '✓ 已配置' : '未配置'}
              \${p.last_used ? '· 最近使用: ' + formatDate(p.last_used) : ''}
            </div>
          </div>
          \${p.configured 
            ? '\u003cdiv class="status-dot"></div>' 
            : '\u003cbutton class="btn btn-secondary" onclick="configureProvider(\'' + p.id + '\')">配置</button>'
          }
        </div>
      \`).join('');
    }
    
    // 渲染最近任务
    function renderRecentTasks() {
      const tbody = document.getElementById('recent-tasks');
      const tasks = dashboardData.recent_generations;
      
      tbody.innerHTML = tasks.map(t => \`
        <tr>
          <td>\${t.id.slice(0, 12)}...</td>
          <td>\${t.model}</td>
          <td>\${t.provider}</td>
          <td><span class="status-badge status-\${t.status}">\${t.status}</span></td>
          <td>\${t.cost_usd ? '$' + t.cost_usd.toFixed(3) : '-'}</td>
          <td>\${formatDate(t.created_at)}</td>
        </tr>
      \`).join('');
    }
    
    // 辅助函数
    function getProviderEmoji(id) {
      const emojis = {
        'seedance': '🔴',
        'kling': '🟢',
        'runway': '🟣',
        'pika': '🟡',
        'luma': '🔵',
        'haiper': '🟠',
        'hailuo': '⚪',
        'stable-video': '🟤'
      };
      return emojis[id] || '⚫';
    }
    
    function formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    
    function toggleApiKey() {
      const input = document.getElementById('api-key-display');
      input.type = input.type === 'password' ? 'text' : 'password';
    }
    
    function copyApiKey() {
      navigator.clipboard.writeText(apiKey);
      alert('已复制到剪贴板');
    }
    
    function refreshProviders() {
      loadDashboard();
    }
    
    function configureProvider(providerId) {
      const key = prompt(\`请输入 \${providerId} 的 API Key:\`);
      if (key) {
        fetch(\`\${API_BASE}/v1/providers/\${providerId}\`, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ api_key: key })
        }).then(() => {
          alert('配置成功');
          loadDashboard();
        });
      }
    }
    
    function createGeneration() {
      const model = prompt('选择模型 (例如: seedance-1.0, kling-1.6):');
      const prompt_text = prompt('输入提示词:');
      
      if (model && prompt_text) {
        fetch(\`\${API_BASE}/v1/video/generations\`, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ model, prompt: prompt_text })
        }).then(r => r.json()).then(data => {
          alert('任务创建成功: ' + data.id);
          loadDashboard();
        });
      }
    }
    
    // 启动
    init();
  </script>
</body>
</html>
`;

// Dashboard UI 路由
app.get('/', (c) => {
  return c.html(dashboardHTML);
});

// 设置 API Key 页面
app.get('/setup', (c) => {
  const setupHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Setup - VideoGateway</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #fff;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .setup-box {
      background: #1a1a1a;
      padding: 2rem;
      border-radius: 12px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    h1 {
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    input {
      width: 100%;
      padding: 0.75rem;
      margin: 1rem 0;
      background: #333;
      border: 1px solid #444;
      border-radius: 8px;
      color: white;
      font-family: monospace;
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
    }
    .help {
      margin-top: 1rem;
      font-size: 0.875rem;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="setup-box">
    <h1>🎬 VideoGateway</h1>
    <p>请输入你的 API Key 以访问 Dashboard</p>
    <input type="text" id="apiKey" placeholder="vg_xxx.yyyyyyyy">
    <button onclick="saveKey()">进入 Dashboard</button>
    <p class="help">
      还没有 API Key? <a href="/v1/keys" style="color: #667eea;">创建一个</a>
    </p>
  </div>
  
  <script>
    function saveKey() {
      const key = document.getElementById('apiKey').value;
      if (key) {
        localStorage.setItem('vg_api_key', key);
        window.location.href = '/dashboard';
      }
    }
  </script>
</body>
</html>
  `;
  return c.html(setupHTML);
});

export { app as dashboardUIRouter };
