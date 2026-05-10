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
import { loginUser, clearError, socialLogin } from '../../store/slices/authSlice';
import DeviceService from '../../services/deviceService';
import SocialLoginButtons from '../../components/SocialLoginButtons';
import { useTranslation } from '../../i18n/LanguageContext';

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((state: any) => state.auth);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t.common.error, 'Please fill in all fields');
      return;
    }

    try {
      const deviceId = await DeviceService.getDeviceId();
      await dispatch(loginUser({
        email: email.trim(),
        password,
        deviceId,
      }) as any);

      // Navigation will be handled by the auth state change
      console.log('Login attempt completed');
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  // Show error alert when error state changes
  React.useEffect(() => {
    if (error) {
      Alert.alert('Login Failed', error);
      dispatch(clearError());
    }
  }, [error, dispatch]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>🏸 {t.common.appName}</Text>
          <Text style={styles.subtitle}>{t.auth.loginTitle}</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t.auth.email}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder={t.auth.password}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? t.auth.loggingIn : t.auth.login}
            </Text>
          </TouchableOpacity>

          {/* Social login divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t.auth.orContinue}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google / WeChat OAuth buttons */}
          <SocialLoginButtons
            onLoginSuccess={(data) => {
              dispatch(socialLogin({
                user: data.user,
                tokens: data.tokens,
              }));
            }}
            onLoginError={(error) => {
              console.error('Social login error:', error);
            }}
          />

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.linkText}>
              {t.auth.noAccount}
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
    padding: 20,
    paddingTop: 60,
    minHeight: '100%',
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

export default LoginScreen;