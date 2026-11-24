import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { registerUser, clearError, socialLogin } from '../../store/slices/authSlice';
import SocialLoginButtons from '../../components/SocialLoginButtons';
import { useTranslation } from '../../i18n/LanguageContext';

interface RegisterScreenProps {
  navigation: any;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  // Untyped dispatch: the thunks are consumed with `.unwrap()` so the result
  // type can be read without threading `AppDispatch` through every screen.
  const dispatch = useDispatch<any>();
  const { isLoading, error } = useSelector((state: any) => state.auth);

  // Same as LoginScreen: `Login`/`Register` are pushed on top of `Main`, so we
  // have to pop ourselves once the account is created and the tokens are set.
  const finishAuth = () => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation.navigate('Main');
    }
  };

  const handleRegister = async () => {
    if (!name || !email || !password) {
      setLocalError('Please fill in all required fields');
      return;
    }

    setLocalError(null);
    dispatch(clearError());

    try {
      const result: any = await dispatch(registerUser({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      })).unwrap();

      console.log('Registration succeeded', result?.user?.email ?? '');
      finishAuth();
    } catch (err: any) {
      // The slice already holds the message; the inline block below renders it.
      console.error('Registration failed:', err);
    }
  };

  // `Alert.alert` is a no-op on react-native-web, so failures were invisible in
  // the browser. Keep the native dialog and render the message inline as well.
  React.useEffect(() => {
    if (error && Platform.OS !== 'web') {
      Alert.alert(t.common.error, error);
    }
  }, [error, t.common.error]);

  const visibleError = localError || error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>🏸 {t.common.appName}</Text>
          <Text style={styles.subtitle}>{t.auth.registerTitle}</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={`${t.auth.name} *`}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <TextInput
            style={styles.input}
            placeholder={`${t.auth.email} *`}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder={`${t.auth.password} *`}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder={t.auth.phone}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          {visibleError ? (
            <Text style={styles.errorText}>{visibleError}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? t.auth.creatingAccount : t.auth.register}
            </Text>
          </TouchableOpacity>

          {/* Google / WeChat OAuth buttons — the "or sign up with" divider is
              rendered by the component itself, so it disappears together with
              the buttons when no provider is configured. */}
          <SocialLoginButtons
            dividerText={t.auth.orSignUp}
            onLoginSuccess={(data) => {
              dispatch(socialLogin({
                user: data.user,
                tokens: data.tokens,
              }));
              finishAuth();
            }}
            onLoginError={(error) => {
              console.error('Social login error:', error);
            }}
          />

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.linkText}>
              {t.auth.hasAccount}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingTop: 60,
    minHeight: "100%",
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
  },
  form: {
    width: '100%',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  errorText: {
    color: '#D93025',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkButton: {
    alignItems: 'center',
    padding: 10,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: '#999',
  },
});

export default RegisterScreen;