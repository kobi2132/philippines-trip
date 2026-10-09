// Messages to Jacob's Telegram through his own bot.
// Env: TELEGRAM_BOT_TOKEN (from BotFather), TELEGRAM_CHAT_ID (his numeric id). Without them, nothing is sent.

export const telegramOn = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

export async function telegram(text) {
  if (!telegramOn()) return false;
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) {
    // Never print the URL: it carries the token.
    console.error('telegram failed', res.status, (await res.text()).slice(0, 200));
    return false;
  }
  console.log('telegram sent');
  return true;
}
