import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  type ChatMessage,
  getGreetingMessage,
  getQuickQuestions,
  isApiConfigured,
  sendChatMessage,
} from '@/lib/ai-chat';
import {
  createDriverNetworkPost,
  listDriverNetworkPosts,
  toggleDriverPostLike,
  type DriverNetworkPost,
} from '@/lib/community/driverNetworkStorage';

export default function AssistantScreen() {
  const { t, locale, isRTL } = useI18n();
  const theme = useAppTheme();
  const { customer, isGuest } = useCustomerAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickQuestions, setShowQuickQuestions] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const [posts, setPosts] = useState<DriverNetworkPost[]>([]);
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postBusy, setPostBusy] = useState(false);

  const loadPosts = useCallback(async () => {
    const rows = await listDriverNetworkPosts();
    setPosts(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, [loadPosts]),
  );

  useEffect(() => {
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        content: getGreetingMessage(locale),
        timestamp: Date.now(),
      },
    ]);
    setShowQuickQuestions(true);
  }, [locale]);

  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = text || inputText.trim();
      if (!messageText || isLoading) return;

      if (!isApiConfigured()) {
        Alert.alert(t('chat_error'), t('chat_no_api_key'));
        return;
      }

      setInputText('');
      setShowQuickQuestions(false);

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: messageText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

      try {
        const response = await sendChatMessage(messageText, [...messages, userMsg], {
          locale,
          customerName: customer?.name,
        });
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        Alert.alert(t('chat_error'));
      } finally {
        setIsLoading(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [inputText, isLoading, messages, locale, customer?.name, t],
  );

  async function onCreatePost() {
    if (!customer || isGuest) {
      Alert.alert(t('guest_gate_header'), t('guest_settings_sign_in_hint'));
      return;
    }
    const title = postTitle.trim();
    const body = postBody.trim();
    if (!title || !body) return;
    setPostBusy(true);
    try {
      await createDriverNetworkPost({
        authorId: customer.id,
        authorName: customer.name,
        title,
        body,
      });
      setPostTitle('');
      setPostBody('');
      await loadPosts();
    } finally {
      setPostBusy(false);
    }
  }

  async function onToggleLike(postId: string) {
    if (!customer || isGuest) {
      Alert.alert(t('guest_gate_header'), t('guest_settings_sign_in_hint'));
      return;
    }
    await toggleDriverPostLike(postId, customer.id);
    await loadPosts();
  }

  function handleClearChat() {
    Alert.alert(t('chat_clear_confirm_title'), t('chat_clear_confirm_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('alert_delete'),
        style: 'destructive',
        onPress: () => {
          setMessages([
            {
              id: 'greeting',
              role: 'assistant',
              content: getGreetingMessage(locale),
              timestamp: Date.now(),
            },
          ]);
          setShowQuickQuestions(true);
        },
      },
    ]);
  }

  const quickQuestions = getQuickQuestions(locale);

  const listHeader = (
    <View style={styles.networkSection}>
      <Text style={[styles.networkTitle, { color: theme.text }]}>{t('driver_network_title')}</Text>

      {customer && !isGuest ? (
        <View style={[styles.createCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput
            value={postTitle}
            onChangeText={setPostTitle}
            placeholder={t('driver_network_post_title_placeholder')}
            placeholderTextColor={theme.textDim}
            style={[styles.networkInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
          />
          <TextInput
            value={postBody}
            onChangeText={setPostBody}
            placeholder={t('driver_network_post_body_placeholder')}
            placeholderTextColor={theme.textDim}
            multiline
            style={[styles.networkInput, styles.networkBodyInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
          />
          <Pressable
            onPress={onCreatePost}
            disabled={postBusy || !postTitle.trim() || !postBody.trim()}
            style={[styles.createBtn, { backgroundColor: theme.accent, opacity: postBusy ? 0.6 : 1 }]}>
            <Text style={[styles.createBtnText, { color: theme.onAccent }]}>{t('driver_network_create_post')}</Text>
          </Pressable>
        </View>
      ) : null}

      {posts.length === 0 ? (
        <Text style={[styles.networkEmpty, { color: theme.textMuted }]}>{t('driver_network_empty')}</Text>
      ) : (
        posts.map((post) => {
          const liked = customer ? post.likedBy.includes(customer.id) : false;
          return (
            <View key={post.id} style={[styles.postCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.postTitle, { color: theme.text }]}>{post.title}</Text>
              <Text style={[styles.postMeta, { color: theme.textMuted }]}>{post.authorName}</Text>
              <Text style={[styles.postBody, { color: theme.textMuted }]}>{post.body}</Text>
              <Pressable onPress={() => onToggleLike(post.id)} style={styles.likeBtn}>
                <FontAwesome name={liked ? 'heart' : 'heart-o'} size={16} color={liked ? theme.accent : theme.textMuted} />
                <Text style={[styles.likeText, { color: theme.textMuted }]}>
                  {t('driver_network_like')} · {post.likes}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}

      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Text style={[styles.askAiLabel, { color: theme.text }]}>{t('driver_network_ask_ai')}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('tab_driver_network')}</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>{t('chat_subtitle')}</Text>
        </View>
        <Pressable onPress={handleClearChat} style={styles.clearBtn}>
          <FontAwesome name="trash-o" size={18} color={theme.textMuted} />
        </Pressable>
      </View>

      {!isApiConfigured() ? (
        <View style={[styles.notice, { backgroundColor: theme.warmSoft, borderColor: theme.border }]}>
          <FontAwesome name="exclamation-circle" size={20} color={theme.warm} />
          <Text style={[styles.noticeText, { color: theme.text }]}>{t('chat_no_api_key')}</Text>
        </View>
      ) : null}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageRow,
              item.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant,
            ]}>
            <View
              style={[
                styles.messageBubble,
                item.role === 'user' ? styles.userBubble : styles.assistantBubble,
                item.role === 'user'
                  ? { backgroundColor: theme.accent }
                  : { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
              <Text
                style={[
                  styles.messageText,
                  { color: theme.text },
                  item.role === 'user' && [styles.userText, { color: theme.onAccent }],
                ]}>
                {item.content}
              </Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          <>
            {isLoading ? (
              <View style={styles.typingIndicator}>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={[styles.typingText, { color: theme.textMuted }]}>{t('chat_typing')}</Text>
              </View>
            ) : null}
            {showQuickQuestions && messages.length <= 1 ? (
              <View style={styles.quickQuestionsContainer}>
                <Text style={[styles.quickQuestionsTitle, { color: theme.text }]}>{t('chat_quick_questions')}</Text>
                {quickQuestions.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => handleSend(q)}
                    style={[styles.quickQuestionBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
                    <Text style={[styles.quickQuestionText, { color: theme.accent }]}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        }
      />

      <View style={[styles.inputContainer, { borderTopColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <TextInput
          style={[
            styles.input,
            { textAlign: isRTL ? 'right' : 'left' },
            { color: theme.text, backgroundColor: theme.card, borderColor: theme.border },
          ]}
          placeholder={t('chat_placeholder')}
          placeholderTextColor={theme.textDim}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={600}
          editable={!isLoading}
        />
        <Pressable
          onPress={() => handleSend()}
          disabled={!inputText.trim() || isLoading}
          style={[
            styles.sendBtn,
            { backgroundColor: theme.accent },
            (!inputText.trim() || isLoading) && [styles.sendBtnDisabled, { backgroundColor: theme.textDim }],
          ]}>
          <FontAwesome name="send" size={18} color={theme.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  clearBtn: { padding: 8 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  networkSection: { paddingBottom: 8 },
  networkTitle: { fontSize: 22, fontWeight: '900', marginBottom: 12 },
  createCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  networkInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  networkBodyInput: { minHeight: 72, textAlignVertical: 'top' },
  createBtn: {
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  createBtnText: { fontSize: 14, fontWeight: '800' },
  networkEmpty: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  postCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  postTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  postMeta: { fontSize: 12, marginBottom: 6 },
  postBody: { fontSize: 14, lineHeight: 20 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  likeText: { fontSize: 13, fontWeight: '600' },
  divider: { height: 1, marginVertical: 16 },
  askAiLabel: { fontSize: 18, fontWeight: '900', marginBottom: 8 },
  messageList: { paddingHorizontal: 12, paddingVertical: 12 },
  messageRow: { flexDirection: 'row', marginVertical: 4 },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAssistant: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: {},
  typingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  typingText: { fontSize: 14, fontStyle: 'italic' },
  quickQuestionsContainer: { paddingVertical: 12, gap: 8 },
  quickQuestionsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  quickQuestionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickQuestionText: { fontSize: 14, fontWeight: '600' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {},
});
