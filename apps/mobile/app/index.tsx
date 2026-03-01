/**
 * Home Screen - Document List
 */
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import {
  listDocuments,
  getDocumentsDirectory,
  getDocumentPath,
  createExpoFsAdapter,
} from '@/native-modules/FileSystemModule';
import { createMarkdownXDocument } from '@markdownx/core';

interface DocumentItem {
  name: string;
  path: string;
  modifiedTime: number;
}

export default function HomeScreen() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const router = useRouter();

  // Load documents when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [])
  );

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const names = await listDocuments();
      const docs: DocumentItem[] = [];

      for (const name of names) {
        const path = getDocumentPath(name);
        try {
          const info = await FileSystem.getInfoAsync(path);
          docs.push({
            name: name.replace('.mdx', ''),
            path,
            modifiedTime: info.modificationTime ?? Date.now(),
          });
        } catch {
          // Skip invalid documents
        }
      }

      // Sort by modification time (newest first)
      docs.sort((a, b) => b.modifiedTime - a.modifiedTime);
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!newDocName.trim()) {
      Alert.alert('Error', 'Please enter a document name');
      return;
    }

    const docName = newDocName.trim().endsWith('.mdx')
      ? newDocName.trim()
      : `${newDocName.trim()}.mdx`;
    const path = getDocumentPath(docName);

    // Check if already exists
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      Alert.alert('Error', 'A document with this name already exists');
      return;
    }

    try {
      const fsAdapter = createExpoFsAdapter();
      await createMarkdownXDocument(path, fsAdapter, '# New Document\n\nStart writing...');
      setShowNewDialog(false);
      setNewDocName('');
      await loadDocuments();
      
      // Navigate to the new document
      router.push(`/editor/${encodeURIComponent(docName)}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to create document');
      console.error(error);
    }
  };

  const handleDeleteDocument = (doc: DocumentItem) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${doc.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(doc.path, { idempotent: true });
              await loadDocuments();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete document');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: DocumentItem }) => (
    <TouchableOpacity
      style={styles.documentItem}
      onPress={() => router.push(`/editor/${encodeURIComponent(item.name + '.mdx')}`)}
      onLongPress={() => handleDeleteDocument(item)}
    >
      <View style={styles.documentIcon}>
        <Text style={styles.documentIconText}>📝</Text>
      </View>
      <View style={styles.documentInfo}>
        <Text style={styles.documentName}>{item.name}</Text>
        <Text style={styles.documentDate}>
          {new Date(item.modifiedTime).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.subtitle}>Your Documents</Text>
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => setShowNewDialog(true)}
        >
          <Text style={styles.newButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Document List */}
      {documents.length === 0 && !isLoading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📂</Text>
          <Text style={styles.emptyText}>No documents yet</Text>
          <Text style={styles.emptySubtext}>
            Tap "+ New" to create your first note
          </Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          renderItem={renderItem}
          keyExtractor={item => item.path}
          contentContainerStyle={styles.list}
          refreshing={isLoading}
          onRefresh={loadDocuments}
        />
      )}

      {/* New Document Dialog */}
      <Modal
        visible={showNewDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Document</Text>
            <TextInput
              style={styles.input}
              placeholder="Document name"
              value={newDocName}
              onChangeText={setNewDocName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowNewDialog(false);
                  setNewDocName('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={handleCreateDocument}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  newButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  documentIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  documentIconText: {
    fontSize: 24,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  documentDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
