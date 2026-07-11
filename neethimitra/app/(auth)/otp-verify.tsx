import { Redirect } from 'expo-router';

export default function OtpVerifyScreen() {
  return <Redirect href="/(auth)/phone-auth" />;
}
