/**
 * Editor Screen - WebView-based Markdown Editor
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  createExpoFsAdapter,
  getDocumentPath,
} from '@/native-modules/FileSystemModule';
import {
  createSyncEngine,
  processImage,
  type SyncEngine,
  type BridgeMessage,
} from '@markdownx/core';

// The editor HTML is bundled with the app
// In production, this would be the built editor-web output
const EDITOR_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; }
    body { 
      margin: 0; 
      padding: 16px; 
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 16px;
      line-height: 1.6;
    }
    #editor {
      min-height: 100vh;
      outline: none;
    }
    #editor:empty:before {
      content: attr(data-placeholder);
      color: #999;
    }
    h1 { font-size: 28px; margin: 0 0 16px; }
    h2 { font-size: 24px; margin: 24px 0 12px; }
    h3 { font-size: 20px; margin: 20px 0 10px; }
    p { margin: 8px 0; }
    ul, ol { padding-left: 24px; }
    blockquote { 
      border-left: 4px solid #ddd; 
      margin: 16px 0; 
      padding-left: 16px; 
      color: #666;
    }
    code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    a { color: #007AFF; }
  </style>
</head>
<body>
  <div id="editor" contenteditable="true" data-placeholder="Start writing..."></div>
  <script>
    const editor = document.getElementById('editor');
    let content = '';
    let debounceTimer = null;
    
    // Receive messages from React Native
    window.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'SET_CONTENT') {
          content = msg.content;
          editor.innerHTML = markdownToHtml(content);
        }
      } catch (err) {
        console.error('Message parse error:', err);
      }
    });
    
    // Send messages to React Native
    function sendMessage(msg) {
      window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
    }
    
    // Simple markdown to HTML converter (placeholder)
    function markdownToHtml(md) {
      if (!md) return '';
      return md
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\\*\\*(.*)\\*\\*/gim, '<strong>$1</strong>')
        .replace(/\\*(.*)\\*/gim, '<em>$1</em>')
        .replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/gim, '<img alt="$1" src="$2">')
        .replace(/\\[([^\\]]*)\\]\\(([^)]+)\\)/gim, '<a href="$2">$1</a>')
        .replace(/\`([^\`]+)\`/gim, '<code>$1</code>')
        .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/\\n/g, '<br>');
    }
    
    // Simple HTML to markdown converter (placeholder)
    function htmlToMarkdown(html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      return div.innerText; // Simplified
    }
    
    // Content change handler
    editor.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const newContent = htmlToMarkdown(editor.innerHTML);
        if (newContent !== content) {
          content = newContent;
          sendMessage({ type: 'SAVE', content });
        }
      }, 500);
    });
    
    // Notify ready
    sendMessage({ type: 'READY' });
  </script>
</body>
</html>
`;

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const webViewRef = useRef<WebView>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState('');

  // Load document
  useEffect(() => {
    if (!id) return;

    const loadDocument = async () => {
      try {
        const docName = decodeURIComponent(id);
        const path = getDocumentPath(docName);
        const fsAdapter = createExpoFsAdapter();

        const engine = createSyncEngine({
          basePath: path,
          fsAdapter,
        });

        const result = await engine.load();
        engineRef.current = engine;
        setContent(result.state.content);
        setIsLoading(false);

        // Update title
        navigation.setOptions({
          title: docName.replace('.markdownx', ''),
        });
      } catch (error) {
        console.error('Failed to load document:', error);
        Alert.alert('Error', 'Failed to load document');
        navigation.goBack();
      }
    };

    loadDocument();

    return () => {
      engineRef.current?.destroy();
    };
  }, [id, navigation]);

  // Send content to WebView when loaded
  useEffect(() => {
    if (!isLoading && content !== undefined) {
      webViewRef.current?.postMessage(
        JSON.stringify({ type: 'SET_CONTENT', content })
      );
    }
  }, [isLoading, content]);

  // Handle messages from WebView
  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as BridgeMessage | { type: 'READY' };

      switch (message.type) {
        case 'READY':
          // WebView is ready, send content
          webViewRef.current?.postMessage(
            JSON.stringify({ type: 'SET_CONTENT', content })
          );
          break;

        case 'SAVE':
          // Save content
          if (engineRef.current) {
            await engineRef.current.applyChange(message.content);
            setContent(message.content);
          }
          break;

        case 'UPLOAD_IMAGE':
          // Handle image upload
          if (engineRef.current) {
            try {
              const fsAdapter = createExpoFsAdapter();
              const uint8Array = new Uint8Array(message.data as ArrayBuffer);
              const assetInfo = await processImage(
                uint8Array,
                message.fileName,
                engineRef.current.getAssetsDir(),
                fsAdapter
              );

              webViewRef.current?.postMessage(
                JSON.stringify({
                  type: 'UPLOAD_IMAGE_RESULT',
                  id: message.id,
                  path: assetInfo.relativePath,
                })
              );
            } catch (error) {
              webViewRef.current?.postMessage(
                JSON.stringify({
                  type: 'UPLOAD_IMAGE_ERROR',
                  id: message.id,
                  error: String(error),
                })
              );
            }
          }
          break;
      }
    } catch (error) {
      console.error('Message handling error:', error);
    }
  }, [content]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        style={styles.webview}
        source={{ html: EDITOR_HTML }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        scrollEnabled
        showsVerticalScrollIndicator
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
});
