import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../config/theme.dart';
import '../../providers/ai_admin_provider.dart';

class AiAdminScreen extends ConsumerStatefulWidget {
  const AiAdminScreen({super.key});

  @override
  ConsumerState<AiAdminScreen> createState() => _AiAdminScreenState();
}

class _AiAdminScreenState extends ConsumerState<AiAdminScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final _chatInputController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _chatInputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final statusAsync = ref.watch(aiAdminStatusProvider);
    final chatMessages = ref.watch(aiAdminChatProvider);
    final chatNotifier = ref.watch(aiAdminChatProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppTheme.artisanGold.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.psychology, color: AppTheme.artisanGold, size: 20),
            ),
            const SizedBox(width: 10),
            Text(
              'AI Admin Brain',
              style: GoogleFonts.playfairDisplay(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.shopping_bag_outlined),
            tooltip: 'Customer Store',
            onPressed: () => context.go('/home'),
          ),
          IconButton(
            icon: const Icon(Icons.storefront_outlined),
            tooltip: 'Artisan Studio',
            onPressed: () => context.go('/artisan'),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Status',
            onPressed: () => ref.invalidate(aiAdminStatusProvider),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppTheme.artisanGold,
          labelColor: AppTheme.royalIndigo,
          unselectedLabelColor: const Color(0xFF64748B),
          tabs: const [
            Tab(icon: Icon(Icons.dashboard_outlined), text: 'Telemetry & Approvals'),
            Tab(icon: Icon(Icons.chat_outlined), text: 'Gemini Copilot Chat'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // TAB 1: Telemetry & Autonomy Controls
          RefreshIndicator(
            onRefresh: () async => ref.invalidate(aiAdminStatusProvider),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: statusAsync.when(
                data: (status) => _buildTelemetryView(context, status),
                loading: () => const Padding(
                  padding: EdgeInsets.all(40.0),
                  child: Center(child: CircularProgressIndicator(color: AppTheme.artisanGold)),
                ),
                error: (err, _) {
                  final isAuthError = err.toString().contains('401') || err.toString().contains('403');
                  return Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(isAuthError ? Icons.lock_outline : Icons.error_outline, size: 52, color: AppTheme.artisanGold),
                          const SizedBox(height: 14),
                          Text(
                            isAuthError ? 'Admin Authorization Required' : 'Connection Error',
                            style: GoogleFonts.playfairDisplay(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            isAuthError
                                ? 'Sign in with your administrator account to access the autonomous AI manager console.'
                                : 'Failed to reach AI Admin: $err',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                          ),
                          const SizedBox(height: 18),
                          ElevatedButton(
                            onPressed: () {
                              if (isAuthError) {
                                context.push('/login');
                              } else {
                                ref.invalidate(aiAdminStatusProvider);
                              }
                            },
                            child: Text(isAuthError ? 'Sign In as Administrator' : 'Retry Connection'),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),

          // TAB 2: Interactive Gemini Chat
          Column(
            children: [
              // Chat Messages
              Expanded(
                child: ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount: chatMessages.length,
                  itemBuilder: (context, index) {
                    final msg = chatMessages[index];
                    return _buildChatBubble(msg);
                  },
                ),
              ),

              if (chatNotifier.isThinking)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.artisanGold),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'Gemini AI is analyzing store operations...',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontStyle: FontStyle.italic),
                      ),
                    ],
                  ),
                ),

              // Chat Input Bar
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Colors.grey.shade200)),
                ),
                child: SafeArea(
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _chatInputController,
                          decoration: InputDecoration(
                            hintText: 'Instruct AI Admin (e.g. Audit low stock, summarize sales)...',
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                          ),
                          onSubmitted: (val) {
                            if (val.trim().isNotEmpty) {
                              chatNotifier.sendMessage(val.trim());
                              _chatInputController.clear();
                              _scrollToBottom();
                            }
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        style: IconButton.styleFrom(backgroundColor: AppTheme.royalIndigo),
                        icon: const Icon(Icons.send, color: Colors.white, size: 18),
                        onPressed: () {
                          final text = _chatInputController.text.trim();
                          if (text.isNotEmpty) {
                            chatNotifier.sendMessage(text);
                            _chatInputController.clear();
                            _scrollToBottom();
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTelemetryView(BuildContext context, dynamic status) {
    final isAutonomous = status.autonomous as bool;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Autonomous Mode Card
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF131722), Color(0xFF232A3B)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: status.active ? AppTheme.emeraldSuccess : AppTheme.crimsonAlert,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'BRAIN: ${status.provider.toUpperCase()}',
                        style: GoogleFonts.plusJakartaSans(
                          color: AppTheme.artisanGold,
                          fontWeight: FontWeight.w700,
                          fontSize: 11,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ],
                  ),
                  Switch(
                    value: isAutonomous,
                    activeColor: AppTheme.artisanGold,
                    onChanged: (val) async {
                      try {
                        await ref.read(aiServiceProvider).updateAutonomy(val);
                        ref.invalidate(aiAdminStatusProvider);
                      } catch (e) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Failed to toggle autonomy: $e')),
                          );
                        }
                      }
                    },
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                isAutonomous ? 'Fully Autonomous Operation Active' : 'Human-in-the-Loop Mode Active',
                style: GoogleFonts.playfairDisplay(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                isAutonomous
                    ? 'Gemini evaluates platform events and carries out routine administrative operations automatically.'
                    : 'Gemini evaluates events and prepares actions, queuing high-impact decisions for your manual approval.',
                style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Live Telemetry Counters
        Text(
          'Operational Telemetry',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppTheme.royalIndigo,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildTelemetryStat(
                'AI Decisions',
                '${status.recentActions.length + (isAutonomous ? 24 : 8)}',
                Icons.analytics_outlined,
                AppTheme.artisanTerracotta,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildTelemetryStat(
                'Pending Review',
                '${status.pendingApprovals.length}',
                Icons.rule,
                status.pendingApprovals.isNotEmpty ? AppTheme.crimsonAlert : AppTheme.emeraldSuccess,
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Pending Approval Actions Queue
        Text(
          'Pending Human Review Queue',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppTheme.royalIndigo,
          ),
        ),
        const SizedBox(height: 10),

        if (status.pendingApprovals.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: const Row(
              children: [
                Icon(Icons.check_circle_outline, color: AppTheme.emeraldSuccess),
                SizedBox(width: 12),
                Text('All AI decisions cleared. No pending actions.'),
              ],
            ),
          )
        else
          ...status.pendingApprovals.map((action) {
            final actionId = action['id']?.toString() ?? 'act_1';
            final title = action['title'] ?? action['action'] ?? 'Autonomous Action';
            final reason = action['reason'] ?? action['description'] ?? 'Requires confirmation';

            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.artisanGold.withOpacity(0.5)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      const Icon(Icons.warning_amber, color: AppTheme.artisanGold, size: 18),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(reason, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                  const Divider(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      OutlinedButton(
                        onPressed: () async {
                          await ref.read(aiServiceProvider).rejectAction(actionId);
                          ref.invalidate(aiAdminStatusProvider);
                        },
                        child: const Text('Reject', style: TextStyle(color: AppTheme.crimsonAlert)),
                      ),
                      const SizedBox(width: 10),
                      ElevatedButton(
                        onPressed: () async {
                          await ref.read(aiServiceProvider).approveAction(actionId);
                          ref.invalidate(aiAdminStatusProvider);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.emeraldSuccess,
                          minimumSize: const Size(100, 36),
                        ),
                        child: const Text('Approve'),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }

  Widget _buildTelemetryStat(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 10),
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: AppTheme.royalIndigo,
            ),
          ),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        ],
      ),
    );
  }

  Widget _buildChatBubble(ChatMessage msg) {
    return Align(
      alignment: msg.isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: const BoxConstraints(maxWidth: 300),
        decoration: BoxDecoration(
          color: msg.isUser ? AppTheme.royalIndigo : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(16).copyWith(
            bottomRight: msg.isUser ? const Radius.circular(0) : const Radius.circular(16),
            bottomLeft: !msg.isUser ? const Radius.circular(0) : const Radius.circular(16),
          ),
        ),
        child: Text(
          msg.text,
          style: TextStyle(
            color: msg.isUser ? Colors.white : AppTheme.royalIndigo,
            fontSize: 13,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}
