import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import '../../config/theme.dart';
import '../../services/ai_service.dart';
import '../../services/product_service.dart';

class AddProductCameraScreen extends StatefulWidget {
  const AddProductCameraScreen({super.key});

  @override
  State<AddProductCameraScreen> createState() => _AddProductCameraScreenState();
}

class _AddProductCameraScreenState extends State<AddProductCameraScreen> {
  final _picker = ImagePicker();
  final _notesController = TextEditingController();
  final _productService = ProductService();
  final _aiService = AiService();

  XFile? _selectedImage;
  bool _isProcessing = false;
  String _processingStep = '';

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picked = await _picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 1600,
        maxHeight: 1600,
      );
      if (picked != null) {
        setState(() {
          _selectedImage = picked;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to capture image: $e')),
        );
      }
    }
  }

  Future<void> _uploadAndAnalyze() async {
    if (_selectedImage == null) return;

    setState(() {
      _isProcessing = true;
      _processingStep = '1/2 Uploading craft photo to secure storage...';
    });

    try {
      // Step 1: Upload to Cloudinary via backend /api/products/upload
      final uploadedUrl = await _productService.uploadImage(
        _selectedImage!.path,
        _selectedImage!.name,
      );

      setState(() {
        _processingStep = '2/2 Gemini AI analyzing craft, heritage story & fair price...';
      });

      // Step 2: Analyze with Gemini AI
      final analysis = await _aiService.analyzeProduct(
        imageUrl: uploadedUrl,
        notes: _notesController.text.trim(),
      );

      if (mounted) {
        setState(() => _isProcessing = false);
        // Pass data to AI Studio screen
        context.push(
          '/artisan/ai-studio',
          extra: {
            'imageUrl': uploadedUrl,
            'title': analysis.title,
            'description': analysis.description,
            'category': analysis.category,
            'suggestedPrice': analysis.suggestedPrice,
            'tags': analysis.tags,
          },
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isProcessing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('AI Processing failed: ${e.toString().replaceAll("Exception: ", "")}'),
            backgroundColor: AppTheme.crimsonAlert,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'AI Camera Studio',
          style: GoogleFonts.playfairDisplay(fontWeight: FontWeight.w700),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Capture Your Handcraft',
              style: GoogleFonts.playfairDisplay(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: AppTheme.royalIndigo,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Photograph your handmade item in good natural lighting. KalaStyle AI will compose your product listing automatically.',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: const Color(0xFF64748B),
              ),
            ),
            const SizedBox(height: 20),

            // Image Preview or Placeholder
            GestureDetector(
              onTap: () => _showSourceActionSheet(),
              child: Container(
                width: double.infinity,
                height: 280,
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _selectedImage != null ? AppTheme.artisanGold : const Color(0xFFCBD5E1),
                    width: 2,
                  ),
                ),
                child: _selectedImage != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.file(
                              File(_selectedImage!.path),
                              fit: BoxFit.cover,
                            ),
                            Positioned(
                              bottom: 12,
                              right: 12,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: Colors.black.withOpacity(0.7),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.edit, color: Colors.white, size: 14),
                                    SizedBox(width: 4),
                                    Text('Retake', style: TextStyle(color: Colors.white, fontSize: 12)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(18),
                            decoration: BoxDecoration(
                              color: AppTheme.artisanTerracotta.withOpacity(0.1),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.camera_alt_outlined,
                              size: 40,
                              color: AppTheme.artisanTerracotta,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            'Tap to Open Camera or Gallery',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              color: AppTheme.royalIndigo,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'PNG, JPG up to 10MB',
                            style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 20),

            // Optional Artisan Notes
            Text(
              'Artisan Craft Notes (Optional)',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF334155),
              ),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _notesController,
              maxLines: 2,
              decoration: const InputDecoration(
                hintText: 'e.g., Pure Kanjivaram silk, natural madder dye, made by hand on pit loom in Varanasi.',
              ),
            ),
            const SizedBox(height: 28),

            // Action Button
            if (_isProcessing) ...[
              Center(
                child: Column(
                  children: [
                    const CircularProgressIndicator(color: AppTheme.artisanTerracotta),
                    const SizedBox(height: 14),
                    Text(
                      _processingStep,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.artisanTerracotta,
                      ),
                    ),
                  ],
                ),
              ),
            ] else ...[
              ElevatedButton.icon(
                onPressed: _selectedImage != null ? _uploadAndAnalyze : null,
                icon: const Icon(Icons.auto_awesome),
                label: const Text('Analyze & Compose with Gemini AI'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.royalIndigo,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showSourceActionSheet() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt, color: AppTheme.artisanTerracotta),
              title: const Text('Take Photo with Camera'),
              onTap: () {
                Navigator.pop(ctx);
                _pickImage(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library, color: AppTheme.royalIndigo),
              title: const Text('Choose from Photo Gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickImage(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }
}
