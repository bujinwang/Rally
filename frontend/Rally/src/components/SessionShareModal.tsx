import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Share,
  Clipboard,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

interface SessionShareModalProps {
  visible: boolean;
  onClose: () => void;
  shareCode: string;
  sessionName: string;
  sessionDate: string;
  organizerSecret?: string;
}

const { width: screenWidth } = Dimensions.get('window');
const QR_SIZE = Math.min(screenWidth * 0.6, 250);

export default function SessionShareModal({ 
  visible, 
  onClose, 
  shareCode, 
  sessionName, 
  sessionDate,
  organizerSecret
}: SessionShareModalProps) {
  const [copied, setCopied] = useState(false);
  
  const shareLink = `https://badminton-group.app/join/${shareCode}`;
  const shortShareCode = shareCode.toUpperCase();
  
  const handleCopyCode = async () => {
    try {
      await Clipboard.setString(shortShareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      Alert.alert('Copied!', 'Share code copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy share code');
    }
  };

  const handleCopySecret = async () => {
    if (!organizerSecret) return;
    try {
      await Clipboard.setString(organizerSecret);
      Alert.alert('Copied!', 'Organizer secret copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy organizer secret');
    }
  };
  
  const handleCopyLink = async () => {
    try {
      await Clipboard.setString(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      Alert.alert('Copied!', 'Share link copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy share link');
    }
  };
  
  const handleShare = async () => {
    try {
      const message = `Join my badminton session!\n\n📅 ${sessionName}\n🗓️ ${sessionDate}\n\n🔗 Join link: ${shareLink}\n💯 Or use code: ${shortShareCode}`;
      
      await Share.share({
        message,
        title: 'Join Badminton Session',
        url: shareLink, // iOS will use this
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share session');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Share Session</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Session Info */}
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionName}>{sessionName}</Text>
            <Text style={styles.sessionDate}>{sessionDate}</Text>
          </View>

          {/* Organizer Secret - Only shown on creation */}
          {organizerSecret && (
            <View style={styles.secretSection}>
              <View style={styles.secretHeader}>
                <Ionicons name="key" size={20} color="#FF9500" />
                <Text style={styles.secretTitle}>Organizer Secret</Text>
              </View>
              <View style={styles.secretContainer}>
                <Text style={styles.secretCode}>{organizerSecret}</Text>
                <TouchableOpacity onPress={handleCopySecret} style={styles.copyButton}>
                  <Ionicons name="copy" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
              <View style={styles.warningBox}>
                <Ionicons name="warning" size={16} color="#FF3B30" />
                <Text style={styles.warningText}>
                  Save this secret! You'll need it to regain organizer access if you change devices.
                </Text>
              </View>
            </View>
          )}

          {/* QR Code */}
          <View style={styles.qrContainer}>
            <Text style={styles.sectionTitle}>Scan QR Code</Text>
            <View style={styles.qrCodeWrapper}>
              <QRCode
                value={shareLink}
                size={QR_SIZE}
                color="#333"
                backgroundColor="#fff"
              />
            </View>
            <Text style={styles.qrDescription}>
              Players can scan this code to join instantly
            </Text>
          </View>

          {/* Share Code */}
          <View style={styles.codeSection}>
            <Text style={styles.sectionTitle}>Share Code</Text>
            <View style={styles.codeContainer}>
              <Text style={styles.shareCode}>{shortShareCode}</Text>
              <TouchableOpacity 
                onPress={handleCopyCode}
                style={[styles.copyButton, copied && styles.copyButtonActive]}
              >
                <Ionicons 
                  name={copied ? "checkmark" : "copy"} 
                  size={20} 
                  color={copied ? "#4CAF50" : "#007AFF"} 
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.codeDescription}>
              Or enter this code manually in the app
            </Text>
          </View>

          {/* Share Link */}
          <View style={styles.linkSection}>
            <Text style={styles.sectionTitle}>Share Link</Text>
            <TouchableOpacity onPress={handleCopyLink} style={styles.linkContainer}>
              <Text style={styles.shareLink} numberOfLines={1}>
                {shareLink}
              </Text>
              <Ionicons name="copy" size={18} color="#007AFF" />
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
              <Ionicons name="share" size={20} color="white" />
              <Text style={styles.shareButtonText}>Share Session</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  sessionInfo: {
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  sessionDate: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  qrCodeWrapper: {
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginBottom: 8,
  },
  qrDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  secretSection: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  secretHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  secretTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginLeft: 8,
  },
  secretContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  secretCode: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FF9500',
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: 2,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFE8E8',
    padding: 10,
    borderRadius: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#FF3B30',
    marginLeft: 8,
    lineHeight: 18,
  },
  codeSection: {
    marginBottom: 20,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  shareCode: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  copyButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  copyButtonActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  codeDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  linkSection: {
    marginBottom: 24,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  shareLink: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
    marginRight: 8,
  },
  actions: {
    alignItems: 'center',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 150,
    justifyContent: 'center',
  },
  shareButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});