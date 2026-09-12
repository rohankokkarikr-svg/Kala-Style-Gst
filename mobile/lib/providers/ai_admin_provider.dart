import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/ai_service.dart';

class ChatMessage {
  final String text;
  final bool isUser;
  final DateTime timestamp;

  ChatMessage({
    required this.text,
    required this.isUser,
    required this.timestamp,
  });
}

final aiServiceProvider = Provider<AiService>((ref) => AiService());

final aiAdminStatusProvider = FutureProvider.autoDispose<AiAdminStatusModel>((ref) async {
  final service = ref.watch(aiServiceProvider);
  return await service.getAiAdminStatus();
});

class AiAdminChatNotifier extends StateNotifier<List<ChatMessage>> {
  final AiService _aiService;
  bool isThinking = false;

  AiAdminChatNotifier(this._aiService) : super([
    ChatMessage(
      text: "KalaStyle Autonomous AI Admin initialized. Powered by Google Gemini. How can I assist with your store operations, artisan approvals, or inventory today?",
      isUser: false,
      timestamp: DateTime.now(),
    ),
  ]);

  Future<void> sendMessage(String text) async {
    if (text.trim().isEmpty) return;

    final userMsg = ChatMessage(
      text: text.trim(),
      isUser: true,
      timestamp: DateTime.now(),
    );

    state = [...state, userMsg];
    isThinking = true;

    try {
      final reply = await _aiService.chatWithAiAdmin(userMsg.text);
      final aiMsg = ChatMessage(
        text: reply,
        isUser: false,
        timestamp: DateTime.now(),
      );
      state = [...state, aiMsg];
    } catch (e) {
      final errorMsg = ChatMessage(
        text: "Error communicating with Gemini brain: ${e.toString().replaceAll('Exception: ', '')}",
        isUser: false,
        timestamp: DateTime.now(),
      );
      state = [...state, errorMsg];
    } finally {
      isThinking = false;
    }
  }
}

final aiAdminChatProvider = StateNotifierProvider<AiAdminChatNotifier, List<ChatMessage>>((ref) {
  final aiService = ref.watch(aiServiceProvider);
  return AiAdminChatNotifier(aiService);
});
