import { Tabs } from 'expo-router';
import { CustomTabBar } from '../../components/CustomTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="couple" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="mood" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
