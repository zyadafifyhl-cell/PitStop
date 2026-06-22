/**
 * AI car assistant — bilingual, Egypt-focused, practical diagnostics.
 */

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

export type ChatContext = {
  locale: 'en' | 'ar';
  customerName?: string;
};

const SYSTEM_PROMPT_EN = `You are "PitStop Assistant" — an experienced auto technician helping drivers in Egypt.

Your job: diagnose symptoms, explain clearly, and guide safe next steps. You are helpful and smart, NOT generic or vague.

Rules:
- Reply in the same language the user uses (English, Arabic, or Franco-Arab mix).
- Egypt context: heat, dust, potholes, stop-and-go traffic, fuel quality, common brands (Hyundai, Nissan, Chevrolet, Kia, Toyota, etc.).
- If the user is vague, ask 1–2 short clarifying questions BEFORE guessing (when? cold/hot engine? noise type? warning lights?).
- Never guess dangerously on brakes, steering, fuel leaks, smoke, or overheating — treat as HIGH urgency.
- Separate: (a) what it likely is, (b) what user can check safely now, (c) DIY only if truly safe, (d) visit workshop when needed.
- Mention rough cost level in EGP when useful (low/medium/high) without fake precision.
- If maintenance booking fits, suggest using the app's maintenance booking — don't invent shop names.
- No markdown headers. Use short paragraphs or numbered steps.
- Max ~180 words unless user asks for detail.
- Never say you cannot help — always give actionable guidance or questions.

Response format:
• Likely cause(s)
• What to check now (safe steps)
• DIY or workshop?
• Urgency: Low / Medium / High`;

const SYSTEM_PROMPT_AR = `أنت "مساعد PitStop" — فني سيارات خبير بيساعد السائقين في مصر.

دورك: تشخيص الأعراض، شرح واضح، وخطوات آمنة. كون مفيد وذكي — مش كلام عام فاضي.

قواعد:
- رد بنفس لغة المستخدم (عربي، إنجليزي، أو Franco-Arab).
- سياق مصر: حر، تراب، مطبات، زحمة، جودة بنزين، ماركات شائعة (Hyundai, Nissan, Chevrolet, Kia, Toyota...).
- لو الكلام مش واضح، اسأل 1–2 سؤال قصير قبل التخمين (امتى؟ بارد/سخن؟ نوع الصوت؟ لمبات؟).
- ممنوع تخمين خطير في الفرامل، الدركسيون، تسريب بنزين، دخان، أو سخونة — اعتبرها استعجال عالي.
- افصل: (1) السبب المحتمل (2) إيه اللي يقدر يفحصه بنفسه بأمان (3) DIY بس لو آمن (4) ورشة امتى.
- اذكر تكلفة تقريبية بالجنيه (منخفض/متوسط/عالي) بدون أرقام وهمية.
- لو محتاج صيانة، اقترح يحجز من التطبيق — مت invent أسماء محلات.
- بدون markdown. فقرات قصيرة أو خطوات مرقمة.
- حوالي 180 كلمة كحد أقصى إلا لو طلب تفاصيل.
- متقولش "مش قادر أساعد" — دايمًا قدم خطوة أو سؤال.

تنسيق الرد:
• السبب المحتمل
• افحص إيه دلوقتي (خطوات آمنة)
• بنفسك ولا ورشة؟
• الاستعجال: منخفض / متوسط / عالي`;

function apiErrorMessage(locale: 'en' | 'ar', status?: number): string {
  if (locale === 'ar') {
    if (status === 401) return 'مفتاح OpenAI غير صحيح. راجع ملف .env';
    if (status === 429) return 'طلبات كتير — جرب بعد شوية.';
    return 'حصل خطأ في الاتصال. جرب تاني.';
  }
  if (status === 401) return 'Invalid OpenAI API key. Check your .env file.';
  if (status === 429) return 'Too many requests — try again in a moment.';
  return 'Connection error. Please try again.';
}

async function callChatAPI(
  messages: Array<{ role: string; content: string }>,
  locale: 'en' | 'ar',
): Promise<string> {
  const API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
  const API_URL = 'https://api.openai.com/v1/chat/completions';

  if (!API_KEY) {
    return locale === 'ar'
      ? 'المساعد مش مفعّل. أضف EXPO_PUBLIC_OPENAI_API_KEY في ملف .env'
      : 'Assistant not configured. Add EXPO_PUBLIC_OPENAI_API_KEY to .env';
  }

  try {
    const systemPrompt = locale === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.45,
        max_tokens: 650,
        presence_penalty: 0.1,
        frequency_penalty: 0.2,
      }),
    });

    if (!response.ok) {
      return apiErrorMessage(locale, response.status);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || (locale === 'ar' ? 'مفيش رد — جرب تاني.' : 'No response — try again.');
  } catch (error) {
    console.error('Chat API error:', error);
    return apiErrorMessage(locale);
  }
}

export async function sendChatMessage(
  userMessage: string,
  chatHistory: ChatMessage[],
  context: ChatContext,
): Promise<string> {
  const recentMessages = chatHistory
    .filter((m) => m.id !== 'greeting')
    .slice(-10)
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

  let prefix = '';
  if (context.customerName) {
    prefix =
      context.locale === 'ar'
        ? `[اسم العميل: ${context.customerName}]\n\n`
        : `[Customer name: ${context.customerName}]\n\n`;
  }

  recentMessages.push({
    role: 'user',
    content: prefix + userMessage,
  });

  return callChatAPI(recentMessages, context.locale);
}

export function getGreetingMessage(locale: 'en' | 'ar'): string {
  if (locale === 'ar') {
    return 'أهلًا! اكتب مشكلة عربيتك — صوت، لمبة، سخونة، فرامل… هرشّحلك خطوات آمنة وأقولك تحتاج ورشة ولا لأ.';
  }
  return "Hi! Describe your car issue — noise, warning light, overheating, brakes… I'll suggest safe checks and whether you need a workshop.";
}

export function getQuickQuestions(locale: 'en' | 'ar'): string[] {
  if (locale === 'ar') {
    return [
      'العربية بتسخن بعد 10 دقايق',
      'صوت scraping من الفرامل',
      'لمبة Check Engine ولعت',
      'العربية بتتهز على سرعة 80',
      'البطارية بتفضى كل يومين',
      'AC مش بيبرد زي الأول',
    ];
  }
  return [
    'Car overheats after 10 minutes',
    'Scraping noise from brakes',
    'Check engine light is on',
    'Vibration at 80 km/h',
    'Battery dies every 2 days',
    'AC not cooling like before',
  ];
}

export function isApiConfigured(): boolean {
  return !!(process.env.EXPO_PUBLIC_OPENAI_API_KEY || '').startsWith('sk-');
}
