import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kala_style_ai_mobile/main.dart';

void main() {
  testWidgets('KalaStyle AI App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: KalaStyleApp(),
      ),
    );
    expect(find.byType(KalaStyleApp), findsOneWidget);
  });
}
