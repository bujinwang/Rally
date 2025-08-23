import React, { useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

interface ShareLinkHandlerProps {
  shareCode?: string;
}

export default function ShareLinkHandler({ shareCode }: ShareLinkHandlerProps) {
  const navigation = useNavigation();

  useEffect(() => {
    if (shareCode) {
      // Navigate to join session screen with the share code
      (navigation as any).navigate('JoinSession', { shareCode });
    }
  }, [shareCode, navigation]);

  // Show loading state while processing the link
  if (shareCode) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Processing share link...</Text>
      </View>
    );
  }

  return null;
}

// Utility function to extract share code from URL
export const extractShareCodeFromUrl = (url: string): string | null => {
  try {
    const regex = /\/join\/([A-Z0-9]{6})/i;
    const match = url.match(regex);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting share code:', error);
    return null;
  }
};

// Function to create shareable URLs for different platforms
export const createShareableLinks = (shareCode: string, sessionName: string, scheduledAt: string, location: string, ownerName: string) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const shareUrl = `${baseUrl}/join/${shareCode}`;
  
  // WeChat message (Chinese)
  const weChatMessage = `🏸 羽毛球局邀请

📅 时间: ${new Date(scheduledAt).toLocaleDateString('zh-CN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}
📍 地点: ${location || '待定'}
👤 组织者: ${ownerName}

点击链接加入: ${shareUrl}

代码: ${shareCode}`;

  // WhatsApp message (English)
  const whatsAppMessage = `🏸 Badminton Session Invitation

📅 When: ${new Date(scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}
📍 Where: ${location || 'TBD'}
👤 Organizer: ${ownerName}

Join here: ${shareUrl}

Code: ${shareCode}`;

  return {
    shareUrl,
    weChatMessage,
    whatsAppMessage,
    shareCode
  };
};