/**
 * Root Layout
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#f5f5f5',
          },
          headerTintColor: '#333',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'MarkdownX',
          }}
        />
        <Stack.Screen
          name="editor/[id]"
          options={{
            title: 'Editor',
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
    </>
  );
}
