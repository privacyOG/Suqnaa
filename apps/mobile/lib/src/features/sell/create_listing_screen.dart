import 'package:flutter/material.dart';
import '../../brand/brand.dart';
import '../../session/api_access.dart';
import '../../session/access_state.dart';

class CreateListingScreen extends StatefulWidget {
  const CreateListingScreen({super.key});

  @override
  State<CreateListingScreen> createState() => _CreateListingScreenState();
}

class _CreateListingScreenState extends State<CreateListingScreen> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  final _currencyController = TextEditingController(text: 'AUD');

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    _currencyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const access = ApiAccess(AccessState(value: ''));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Create listing'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Sell on Suqnaa',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
          ),
          const SizedBox(height: 8),
          const Text('Add the basic listing details. Account connection will be enabled once the session layer is wired.'),
          const SizedBox(height: 24),
          _Field(label: 'Title', controller: _titleController, hint: 'Example: New phone'),
          const SizedBox(height: 14),
          _Field(label: 'Description', controller: _descriptionController, hint: 'Describe the item', maxLines: 5),
          const SizedBox(height: 14),
          _Field(label: 'Price', controller: _priceController, hint: '0.00', keyboardType: TextInputType.number),
          const SizedBox(height: 14),
          _Field(label: 'Currency', controller: _currencyController, hint: 'AUD'),
          const SizedBox(height: 22),
          FilledButton(
            onPressed: access.isReady ? () {} : null,
            child: const Text('Save draft'),
          ),
          if (!access.isReady) ...[
            const SizedBox(height: 12),
            const Text(
              'Sign in will be required before publishing.',
              style: TextStyle(color: SuqnaaBrand.muted),
            ),
          ],
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.controller, required this.hint, this.maxLines = 1, this.keyboardType});

  final String label;
  final TextEditingController controller;
  final String hint;
  final int maxLines;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none),
      ),
    );
  }
}
