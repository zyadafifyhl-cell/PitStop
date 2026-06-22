# PitStop - AI Assistant Setup

## 🚗 تطبيق صيانة السيارات المصري / PitStop App

A bilingual (Arabic/English) car maintenance tracking app with AI-powered diagnostics for Egyptian car owners.

### ✨ Features / المميزات

1. **Egyptian Car Catalog** - 100+ car models common in Egypt
2. **Maintenance Tracking** - Track oil changes, services, and kilometers
3. **AI Car Assistant** 🤖 - Bilingual chatbot for diagnosing car problems
4. **Smart Reminders** - Every 2 days, 3 days, or weekly notifications
5. **Cloud Sync** - Supabase integration for multi-device sync
6. **RTL Support** - Full Arabic language support with proper RTL layout

---

## 🚀 Quick Setup / التثبيت السريع

### 1. Install Dependencies / تثبيت المتطلبات

```bash
cd pitstop
npm install
```

### 2. Configure Environment / إعداد البيئة

Create a `.env` file in the `pitstop` folder:

```bash
cp .env.example .env
```

Then edit `.env` and add your API keys:

```env
# Required for AI Assistant
EXPO_PUBLIC_OPENAI_API_KEY=sk-your-openai-key-here

# Optional for cloud sync
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
```

### 3. Get OpenAI API Key / الحصول على مفتاح API

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy and paste it into your `.env` file
4. **Cost**: GPT-4o-mini is very affordable (~$0.15 per 1M input tokens)

### 4. Run the App / تشغيل التطبيق

```bash
# For Android
npm run android

# For iOS
npm run ios

# For Web (limited features)
npm run web
```

---

## 🤖 AI Assistant Features / مميزات المساعد الذكي

The AI chatbot helps Egyptian car owners:

- **Diagnose car problems** in Arabic or English
- **Suggest DIY fixes** vs. when to see a mechanic
- **Understand car sounds** and warning lights
- **Get maintenance advice** specific to Egypt's climate
- **Quick answers** to common issues

### Example Conversations:

**English:**
```
User: "Check engine light is on"
AI: "The check engine light indicates a problem detected by your car's computer. 
     Common causes: loose gas cap, O2 sensor, catalytic converter. 
     Recommended: Visit a mechanic with a diagnostic scanner. Urgency: Medium-High"
```

**Arabic:**
```
User: "عندي صوت غريب من الفرامل"
AI: "الصوت الغريب من الفرامل قد يكون بسبب:
     ١. تآكل تيل الفرامل
     ٢. قرص الفرامل محتاج تنظيف
     الإجراء الموصى به: زيارة ميكانيكي للفحص. الاستعجال: عالي (الفرامل أمان)"
```

---

## 📱 App Structure / هيكل التطبيق

```
pitstop/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx          # My Garage / الكراج
│   │   ├── catalog.tsx        # Egyptian Cars / الكتالوج
│   │   ├── alerts.tsx         # Reminders / التذكيرات
│   │   └── assistant.tsx      # AI Chat / المساعد الذكي ⭐
├── lib/
│   ├── ai-chat.ts             # AI chatbot logic ⭐
│   ├── egyptCatalog.ts        # 100+ Egyptian car models
│   ├── storage.native.ts      # SQLite database
│   ├── reminders.ts           # Enhanced notification system
│   └── i18n/strings.ts        # Arabic/English translations
└── .env                       # Your API keys (create this)
```

---

## 🔧 Customization / التخصيص

### Using a Different AI Provider / استخدام مزود AI آخر

The AI chatbot uses OpenAI by default, but you can easily switch to:

- **Groq** (fast & free tier available)
- **Together AI** (open models)
- **Local LLM** (Ollama, LM Studio)
- **Azure OpenAI**

Just modify `lib/ai-chat.ts` and change the `API_URL` and headers.

### Adding More Car Models / إضافة موديلات سيارات

Edit `lib/egyptCatalog.ts` to add more cars:

```typescript
{
  brand: 'YourBrand',
  model: 'YourModel',
  variant: 'Trim level',
  services: standardTurboIce(), // or create custom intervals
}
```

---

## 📊 Database Schema / قاعدة البيانات

The app uses SQLite locally with these tables:

- `catalog_car` - All Egyptian car models
- `catalog_service` - Maintenance intervals per model
- `user_vehicle` - User's garage (their cars)
- `user_service_state` - Tracking what was done and when

---

## 🎨 UI Design / التصميم

**Classic, Simple Design** as requested:

- **Clean colors**: Soft blues, whites, grays
- **Easy navigation**: 4 tabs with clear icons
- **RTL support**: Perfect Arabic layout
- **Accessible**: Large touch targets, high contrast

---

## 🌍 Deployment / النشر

### For Android APK:

```bash
eas build --platform android
```

### For iOS:

```bash
eas build --platform ios
```

### Web Version:

```bash
npm run web
# Note: Reminders won't work on web, only mobile
```

---

## 💰 Cost Estimation / التكلفة المتوقعة

**OpenAI API (GPT-4o-mini):**
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens
- **Average chat**: ~500 tokens ≈ $0.0004 per conversation
- **Monthly estimate** (100 users, 10 chats each): ~$0.40

**Very affordable!** 💚

---

## 🐛 Troubleshooting / حل المشاكل

### AI Assistant says "service unavailable"
- Check your `.env` file has `EXPO_PUBLIC_OPENAI_API_KEY`
- Verify the API key is valid at OpenAI dashboard
- Check internet connection

### Reminders not working
- Only works on Android/iOS, not web
- Grant notification permissions in phone settings
- Make sure you toggled reminders ON in the app

### Arabic text showing wrong direction
- This is automatically handled by `I18nManager`
- Reload the app after changing language

---

## 📞 Support / الدعم

For issues or questions:
1. Check the logs: `npx expo start --dev-client`
2. Review the `.env.example` configuration
3. Test API key with a simple curl command

---

## 📄 License

MIT License - Free to use and modify

---

## 🙏 Credits / الشكر

- **Egyptian Car Catalog**: Curated list of 100+ models
- **OpenAI**: GPT-4o-mini for AI assistant
- **Expo**: Cross-platform framework
- **Supabase**: Cloud sync & authentication

---

## 🚀 Next Steps / الخطوات التالية

1. ✅ Set up your `.env` with OpenAI API key
2. ✅ Run `npm install`
3. ✅ Test on Android/iOS: `npm run android` or `npm run ios`
4. ✅ Try the AI assistant in both Arabic and English
5. ✅ Deploy to Google Play / App Store

**Good luck with your launch in Egypt!** 🇪🇬

**بالتوفيق مع إطلاق التطبيق في مصر!** 🚗
