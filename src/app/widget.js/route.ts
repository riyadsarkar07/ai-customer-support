import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = env.APP_URL;
  const script = `
(function () {
  var script = document.currentScript;
  var key = script && script.getAttribute('data-key');
  if (!key) return;
  var api = ${JSON.stringify(baseUrl)};
  var token = null;
  var since = null;
  var open = false;
  var poll = null;

  var host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.bottom = '20px';
  host.style.right = '20px';
  host.style.zIndex = '2147483000';
  document.body.appendChild(host);

  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Open chat');
  btn.style.cssText = 'width:56px;height:56px;border-radius:50%;border:none;background:#1d4ed8;color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2);font-size:24px;display:flex;align-items:center;justify-content:center';
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  host.appendChild(btn);

  var panel = document.createElement('div');
  panel.style.cssText = 'display:none;position:fixed;bottom:88px;right:20px;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.24);overflow:hidden;font-family:system-ui,-apple-system,sans-serif;flex-direction:column';
  host.appendChild(panel);

  var header = document.createElement('div');
  header.style.cssText = 'padding:14px 16px;background:#1d4ed8;color:#fff;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center';
  header.innerHTML = '<span>Chat with us</span>';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '\\u00d7';
  closeBtn.style.cssText = 'background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1';
  closeBtn.setAttribute('aria-label', 'Close chat');
  header.appendChild(closeBtn);
  panel.appendChild(header);

  var list = document.createElement('div');
  list.style.cssText = 'flex:1;overflow-y:auto;padding:12px;background:#f8fafc;display:flex;flex-direction:column;gap:8px';
  panel.appendChild(list);

  var form = document.createElement('div');
  form.style.cssText = 'display:flex;gap:8px;padding:10px;border-top:1px solid #e2e8f0;background:#fff';
  var input = document.createElement('input');
  input.placeholder = 'Type your message...';
  input.style.cssText = 'flex:1;border:1px solid #e2e8f0;border-radius:20px;padding:10px 14px;font-size:14px;outline:none';
  var send = document.createElement('button');
  send.textContent = 'Send';
  send.style.cssText = 'background:#1d4ed8;color:#fff;border:none;border-radius:20px;padding:0 16px;font-size:14px;cursor:pointer';
  form.appendChild(input);
  form.appendChild(send);
  panel.appendChild(form);

  function addMessage(body, outbound) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;' + (outbound ? 'justify-content:flex-end' : 'justify-content:flex-start');
    var bubble = document.createElement('div');
    bubble.textContent = body;
    bubble.style.cssText = 'max-width:80%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.4;white-space:pre-wrap;word-break:break-word;' +
      (outbound ? 'background:#1d4ed8;color:#fff;border-bottom-right-radius:4px' : 'background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px');
    row.appendChild(bubble);
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  async function start() {
    var res = await fetch(api + '/api/public/chat/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: key })
    });
    if (!res.ok) throw new Error('init failed');
    var data = await res.json();
    token = data.visitorToken;
    localStorage.setItem('sp_chat_' + key, token);
    if (data.organization && data.organization.brandColor) {
      header.style.background = data.organization.brandColor;
      btn.style.background = data.organization.brandColor;
      send.style.background = data.organization.brandColor;
    }
    await pollMessages();
    poll = setInterval(pollMessages, 3000);
  }

  async function pollMessages() {
    if (!token) return;
    try {
      var url = api + '/api/public/chat/messages?key=' + encodeURIComponent(key) + '&token=' + encodeURIComponent(token);
      if (since) url += '&since=' + encodeURIComponent(since);
      var res = await fetch(url);
      if (!res.ok) return;
      var data = await res.json();
      var msgs = data.messages || [];
      if (msgs.length === 0 && list.childElementCount === 0) {
        addMessage('Hi! How can we help you today?', false);
      }
      msgs.forEach(function (m) {
        addMessage(m.body, m.direction === 'outbound');
        since = m.createdAt;
      });
    } catch (e) {}
  }

  async function sendMessage() {
    var text = input.value.trim();
    if (!text) return;
    if (!token) {
      try { await start(); } catch (e) { return; }
    }
    input.value = '';
    addMessage(text, true);
    try {
      await fetch(api + '/api/public/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: key, visitorToken: token, message: text })
      });
    } catch (e) {}
  }

  btn.onclick = async function () {
    open = !open;
    panel.style.display = open ? 'flex' : 'none';
    if (open && !token) {
      try { await start(); } catch (e) {}
    }
  };
  closeBtn.onclick = function () { open = false; panel.style.display = 'none'; };
  send.onclick = sendMessage;
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMessage(); });

  var saved = localStorage.getItem('sp_chat_' + key);
  if (saved) token = saved;
})();
`;
  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
