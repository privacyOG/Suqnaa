import 'access_state.dart';

class ApiAccess {
  const ApiAccess(this.state);

  final AccessState state;

  String get value => state.value;
  bool get isReady => state.isPresent;
}
