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
export const createShareableLinks = (
  shareCode: string,
  sessionName: string,
  scheduledAt: string,
  location: string,
  ownerName: string,
  players: Array<{name: string, status: string}> = []
) => {
  // Universal link that works for both app and web
  const universalUrl = `https://badmintongroup.app/join/${shareCode}`;
  
  // Fallback web URL for development/testing
  const webFallbackUrl = `http://localhost:3001/session/${shareCode}`;
  
  // Format date and time
  const sessionDate = new Date(scheduledAt);
  const dateStr = sessionDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
  const startTime = sessionDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // Calculate end time (assuming 2-hour default)
  const endTime = new Date(sessionDate.getTime() + 2 * 60 * 60 * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // Format players list
  const formatPlayersList = (players: Array<{name: string, status: string}>) => {
    if (players.length === 0) return `${ownerName}(*)`;

    const playerNames = players.map(player => {
      const isOwner = player.name === ownerName;
      return isOwner ? `${player.name}(*)` : player.name;
    });

    return playerNames.join(', ');
  };

  const playersList = formatPlayersList(players);

  // WeChat message (Chinese) - compact format
  const weChatMessage = `${location || '羽毛球'} - ${dateStr} ${startTime}-${endTime}
📍 地点: ${location || '待定'}
👥 玩家: ${playersList}

🏸 点击加入: ${universalUrl}
💡 建议下载Rally App获得更好体验！`;

  const whatsAppMessage = `${location || 'Badminton'} - ${dateStr} ${startTime}-${endTime}
📍 Where: ${location || 'TBD'}  
👥 Players: ${playersList}

🏸 Join: ${universalUrl}
💡 Download Rally App for best experience!`;

  return {
    shareUrl: universalUrl,
    webFallbackUrl,
    weChatMessage,
    whatsAppMessage,
    shareCode
  };
};