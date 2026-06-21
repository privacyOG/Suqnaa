class MobileEnvironment {
  const MobileEnvironment._();

  static const apiBaseUrl = String.fromEnvironment(
    'SUQNAA_API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );
}
