import 'package:flutter/material.dart';
import '../../brand/brand.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        backgroundColor: SuqnaaBrand.ivory,
        elevation: 0,
        title: const Text(SuqnaaBrand.name),
        actions: const [Icon(Icons.notifications_none), SizedBox(width: 12)],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          _SearchBox(),
          SizedBox(height: 18),
          _CategoryRow(),
          SizedBox(height: 18),
          _HeroCard(),
          SizedBox(height: 24),
          Text('Trending near you', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          SizedBox(height: 12),
          _ProductGrid(),
        ],
      ),
    );
  }
}

class _SearchBox extends StatelessWidget {
  const _SearchBox();

  @override
  Widget build(BuildContext context) {
    return TextField(
      decoration: InputDecoration(
        hintText: 'What are you looking for?',
        prefixIcon: const Icon(Icons.search),
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow();

  @override
  Widget build(BuildContext context) {
    final items = ['Electronics', 'Fashion', 'Home', 'Beauty', 'Vehicles', 'More'];
    return SizedBox(
      height: 86,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) => Column(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: index.isEven ? SuqnaaBrand.blue : SuqnaaBrand.teal,
              child: Text(items[index][0], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 8),
            Text(items[index], style: const TextStyle(fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(colors: [SuqnaaBrand.blue, SuqnaaBrand.teal]),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Great finds.\nFair prices.\nTrusted people.', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
          SizedBox(height: 16),
          Text('Shop now', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _ProductGrid extends StatelessWidget {
  const _ProductGrid();

  @override
  Widget build(BuildContext context) {
    final products = ['Headphones', 'Handbag', 'Watch', 'Camera'];
    return GridView.builder(
      itemCount: products.length,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemBuilder: (context, index) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            const Icon(Icons.shopping_bag_outlined, size: 40),
            const Spacer(),
            Text(products[index], style: const TextStyle(fontWeight: FontWeight.w800)),
            Text('\$${[59, 89, 129, 299][index]}'),
          ],
        ),
      ),
    );
  }
}
