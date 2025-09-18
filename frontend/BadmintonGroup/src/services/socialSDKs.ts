// Social SDK Integrations for Badminton Group
// Note: These integrations require installing the respective SDK packages

// TODO: Install required packages:
// npm install react-native-fbsdk-next @react-native-twitter-signin/twitter-signin
// npm install expo-linking expo-web-browser

import { Share, Linking, Platform } from 'react-native';

export interface SocialShareData {
  type: 'session' | 'match' | 'achievement';
  entityId: string;
  message?: string;
  url: string;
  title?: string;
  preview?: {
    title: string;
    description: string;
    image: string;
  };
}

export class SocialSDKService {
  /**
   * Share to Facebook
   * Requires: react-native-fbsdk-next
   */
  async shareToFacebook(data: SocialShareData) {
    try {
      // TODO: Uncomment when SDK is installed
      /*
      const ShareDialog = require('react-native-fbsdk-next').ShareDialog;

      const shareLinkContent = {
        contentType: 'link',
        contentUrl: data.url,
        contentTitle: data.preview?.title || data.title,
        contentDescription: data.preview?.description,
        imageUrl: data.preview?.image,
      };

      const canShow = await ShareDialog.canShow(shareLinkContent);
      if (canShow) {
        const result = await ShareDialog.show(shareLinkContent);
        return result;
      }
      */

      // Fallback to native share
      const message = data.message || `${data.preview?.title}\n\n${data.url}`;
      await Share.share({
        message,
        title: data.title,
      });

      return { success: true, platform: 'facebook' };
    } catch (error) {
      console.error('Facebook share error:', error);
      throw error;
    }
  }

  /**
   * Share to Twitter
   * Requires: @react-native-twitter-signin/twitter-signin
   */
  async shareToTwitter(data: SocialShareData) {
    try {
      // TODO: Uncomment when SDK is installed
      /*
      const { TwitterSignin } = require('@react-native-twitter-signin/twitter-signin');

      // Check if Twitter is installed
      const isTwitterInstalled = await TwitterSignin.isTwitterInstalled();
      if (!isTwitterInstalled) {
        throw new Error('Twitter app not installed');
      }

      const message = data.message || `${data.preview?.title} ${data.url}`;
      const result = await TwitterSignin.shareText(message);
      */

      // Fallback to URL scheme
      const message = encodeURIComponent(data.message || `${data.preview?.title} ${data.url}`);
      const twitterUrl = `twitter://post?message=${message}`;

      const supported = await Linking.canOpenURL(twitterUrl);
      if (supported) {
        await Linking.openURL(twitterUrl);
      } else {
        // Fallback to web URL
        const webUrl = `https://twitter.com/intent/tweet?text=${message}`;
        await Linking.openURL(webUrl);
      }

      return { success: true, platform: 'twitter' };
    } catch (error) {
      console.error('Twitter share error:', error);
      throw error;
    }
  }

  /**
   * Share to WhatsApp
   */
  async shareToWhatsApp(data: SocialShareData) {
    try {
      const message = data.message || `${data.preview?.title}\n\n${data.url}`;
      const encodedMessage = encodeURIComponent(message);

      let whatsappUrl = '';
      if (Platform.OS === 'ios') {
        whatsappUrl = `whatsapp://send?text=${encodedMessage}`;
      } else {
        whatsappUrl = `whatsapp://send?text=${encodedMessage}`;
      }

      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        // Fallback to web WhatsApp
        const webUrl = `https://wa.me/?text=${encodedMessage}`;
        await Linking.openURL(webUrl);
      }

      return { success: true, platform: 'whatsapp' };
    } catch (error) {
      console.error('WhatsApp share error:', error);
      throw error;
    }
  }

  /**
   * Copy link to clipboard
   */
  async copyLink(data: SocialShareData) {
    try {
      // This would use Clipboard from react-native
      // For now, we'll use the native Share API
      await Share.share({
        message: data.url,
        title: data.title,
      });

      return { success: true, platform: 'copy_link' };
    } catch (error) {
      console.error('Copy link error:', error);
      throw error;
    }
  }

  /**
   * Share using native share sheet
   */
  async shareNative(data: SocialShareData) {
    try {
      const message = data.message || `${data.preview?.title}\n\n${data.url}`;

      const result = await Share.share({
        message,
        title: data.title,
        url: data.url,
      });

      return {
        success: true,
        platform: 'native',
        activityType: result.activityType,
      };
    } catch (error) {
      console.error('Native share error:', error);
      throw error;
    }
  }

  /**
   * Share to specific platform
   */
  async shareToPlatform(platform: string, data: SocialShareData) {
    switch (platform) {
      case 'facebook':
        return this.shareToFacebook(data);
      case 'twitter':
        return this.shareToTwitter(data);
      case 'whatsapp':
        return this.shareToWhatsApp(data);
      case 'copy_link':
        return this.copyLink(data);
      default:
        return this.shareNative(data);
    }
  }
}

export const socialSDKService = new SocialSDKService();