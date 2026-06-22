# حل المشاكل الشائعة | Common Issues & Solutions

## 🔧 Arabic / بالعربي

### المساعد الذكي مش شغال / AI Assistant Not Working

#### المشكلة: "AI assistant is not configured"
**الحل:**
1. تأكد إنك عملت ملف `.env` في مجلد `pitstop`
2. تأكد إنك حطيت المفتاح صح:
```env
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```
3. المفتاح لازم يبدأ بـ `sk-proj-` أو `sk-`
4. أعد تشغيل التطبيق بعد تعديل `.env`

#### المشكلة: "Sorry, an error occurred"
**الحل:**
1. تأكد من اتصال الإنترنت
2. تأكد إن عندك رصيد في حساب OpenAI
3. جرب مفتاح API جديد
4. شوف الـ logs: `npx expo start` وشوف الأخطاء

#### المشكلة: الردود بطيئة جدًا
**الحل:**
- GPT-4o-mini سريع عادةً (1-3 ثواني)
- لو بطيء، جرب:
  - Groq (أسرع ومجاني): https://groq.com
  - غير `API_URL` في `lib/ai-chat.ts`

---

### التذكيرات مش شغالة / Reminders Not Working

#### المشكلة: التذكيرات ما بتوصلش
**الحل:**
1. التذكيرات **بتشتغل على أندرويد وiOS فقط**، مش على المتصفح
2. تأكد إنك فعّلت الإشعارات في إعدادات الهاتف:
   - أندرويد: الإعدادات > التطبيقات > PitStop > الإشعارات
   - iOS: الإعدادات > الإشعارات > PitStop
3. تأكد إنك شغلت التذكيرات من داخل التطبيق (تبويب التذكيرات)

#### المشكلة: التذكيرات كل يومين مش شغالة
**الحل:**
- اختار "كل يومين" من خيارات تكرار التذكير
- افصل التذكيرات وشغلها تاني
- التطبيق يحتاج صلاحية الإشعارات

---

### اللغة العربية مش ظاهرة صح / Arabic Not Showing Correctly

#### المشكلة: النص العربي من الشمال لليمين
**الحل:**
1. اختار "العربية" من تبويب التذكيرات
2. أعد تشغيل التطبيق
3. التطبيق يستخدم RTL تلقائيًا للعربي

#### المشكلة: الخط العربي صغير أو غريب
**الحل:**
- هذا يعتمد على خط النظام في هاتفك
- جرب غير حجم الخط في إعدادات الهاتف

---

### قاعدة البيانات / Database Issues

#### المشكلة: "Could not open your garage database"
**الحل:**
1. احذف التطبيق وثبته تاني
2. امسح الـ cache:
```bash
cd pitstop
rm -rf node_modules/.cache
```
3. أعد تشغيل:
```bash
npm install
npm run android
```

#### المشكلة: السيارات اختفت
**الحل:**
- لو عندك Cloud Sync مفعّل، نزّل من السحابة
- لو لا، البيانات ضاعت - لازم تضيف السيارات تاني
- **نصيحة**: فعّل المزامنة السحابية عشان ما تضيعش البيانات

---

### المزامنة السحابية / Cloud Sync

#### المشكلة: "Sync failed"
**الحل:**
1. تأكد من اتصال الإنترنت
2. تأكد إنك مسجل دخول
3. تأكد إن Supabase مُعدّ صح في `.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

---

### الأداء / Performance Issues

#### المشكلة: التطبيق بطيء
**الحل:**
1. امسح بيانات المحادثة القديمة (زر "مسح المحادثة")
2. أعد تشغيل التطبيق
3. لو المشكلة مستمرة، احذف وثبت التطبيق تاني

---

---

## 🇬🇧 English

### AI Assistant Not Working

#### Issue: "AI assistant is not configured"
**Solution:**
1. Make sure you created a `.env` file in `pitstop` folder
2. Make sure you added the key correctly:
```env
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```
3. The key must start with `sk-proj-` or `sk-`
4. Restart the app after editing `.env`

#### Issue: "Sorry, an error occurred"
**Solution:**
1. Check internet connection
2. Verify you have credits in your OpenAI account
3. Try a new API key
4. Check logs: `npx expo start` and look for errors

#### Issue: Responses are very slow
**Solution:**
- GPT-4o-mini is usually fast (1-3 seconds)
- If slow, try:
  - Groq (faster & free): https://groq.com
  - Change `API_URL` in `lib/ai-chat.ts`

---

### Reminders Not Working

#### Issue: Reminders don't arrive
**Solution:**
1. Reminders **only work on Android and iOS**, not on web browser
2. Make sure notifications are enabled in phone settings:
   - Android: Settings > Apps > PitStop > Notifications
   - iOS: Settings > Notifications > PitStop
3. Make sure you enabled reminders inside the app (Reminders tab)

#### Issue: Every 2 days reminders not working
**Solution:**
- Select "Every 2 days" from reminder frequency options
- Turn reminders off and on again
- App needs notification permission

---

### Arabic Not Showing Correctly

#### Issue: Arabic text is left-to-right
**Solution:**
1. Select "العربية" from Reminders tab
2. Restart the app
3. App uses RTL automatically for Arabic

#### Issue: Arabic font is small or weird
**Solution:**
- This depends on your phone's system font
- Try changing font size in phone settings

---

### Database Issues

#### Issue: "Could not open your garage database"
**Solution:**
1. Delete app and reinstall
2. Clear cache:
```bash
cd pitstop
rm -rf node_modules/.cache
```
3. Restart:
```bash
npm install
npm run android
```

#### Issue: Cars disappeared
**Solution:**
- If you have Cloud Sync enabled, download from cloud
- If not, data is lost - you need to add cars again
- **Tip**: Enable cloud sync so you don't lose data

---

### Cloud Sync

#### Issue: "Sync failed"
**Solution:**
1. Check internet connection
2. Make sure you're signed in
3. Make sure Supabase is configured correctly in `.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

---

### Performance Issues

#### Issue: App is slow
**Solution:**
1. Clear old chat data (tap "Clear chat" button)
2. Restart the app
3. If problem persists, delete and reinstall the app

---

## 📞 Need More Help? | محتاج مساعدة أكثر؟

### Check Logs | شوف الـ Logs

```bash
cd pitstop
npx expo start
```

Look for red errors in the terminal when using the app.

### Test API Key | اختبر مفتاح API

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

If this works, the key is valid.

---

## 🔄 Quick Reset | إعادة تشغيل سريعة

If all else fails:

```bash
# Clean everything
cd pitstop
rm -rf node_modules
rm -rf .expo
rm package-lock.json

# Reinstall
npm install

# Run fresh
npm run android
```

---

## ✅ Checklist | قائمة التحقق

Before asking for help, check:

- [ ] `.env` file exists with correct API key
- [ ] Internet connection is working
- [ ] Notification permissions granted (for reminders)
- [ ] Using Android or iOS (not web for reminders)
- [ ] Restarted app after changing `.env`
- [ ] Checked terminal logs for errors
- [ ] OpenAI account has credits

---

**مفيش مشكلة ما تتحلش! بالتوفيق! 🚀**

**Every problem has a solution! Good luck! 🚀**
