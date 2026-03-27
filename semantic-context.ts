/**
 * SmartMouse Semantic Context Engine
 * "See" pixels → "Understand" meaning → "Decide" smarter actions
 */

import { DetectedObject, VisionData } from './vision.ts';
import { workflowBuildContext } from './workflow-memory.ts';

export interface SemanticContext {
  pageType: 'home' | 'feed' | 'post' | 'profile' | 'search' | 'login' | 'general';
  userStatus: 'logged_in' | 'logged_out' | 'unknown';
  mainContent: {
    type: 'text' | 'image' | 'video' | 'list' | 'form';
    primaryAction: string;
    escalationPath: string;
  };
  navigation: {
    currentSection: string;
    availableSections: string[];
    backHistory: string[];
  };
  objectsByFunction: {
    likeButtons: DetectedObject[];
    commentButtons: DetectedObject[];
    shareButtons: DetectedObject[];
    navigationItems: DetectedObject[];
    inputFields: DetectedObject[];
    buttons: DetectedObject[];
    textBlocks: DetectedObject[];
    images: DetectedObject[];
    videos: DetectedObject[];
  };
  confidence: number;
  summary: string;
}

export interface SemanticAnalysis {
  original: VisionData;
  semantic: SemanticContext;
  recommendations: {
    action: string;
    confidence: number;
    reasoning: string;
    coordinates?: { x: number; y: number };
  }[];
}

/**
 * Analyze screen objects and extract semantic meaning
 */
export function buildSemanticContext(visionData: VisionData, goal?: string): SemanticContext {
  const objects = visionData.detected_objects || [];
  
  // Collect all text for analysis
  const allText = extractAllText(objects);
  const textLower = allText.toLowerCase();
  
  // 1. Determine page type based on content patterns
  const pageType = inferPageType(textLower, objects);
  
  // 2. Determine user status
  const userStatus = inferUserStatus(textLower, objects);
  
  // 3. Identify main content and actions
  const mainContent = inferMainContent(objects);
  
  // 4. Build navigation context
  const navigation = inferNavigation(objects);
  
  // 5. Classify objects by function
  const objectsByFunction = classifyObjectsByFunction(objects);
  
  // 6. Generate summary and confidence
  const confidence = calculateConfidence(objects, pageType, userStatus);
  const summary = generateSummary(pageType, userStatus, mainContent, navigation);
  
  return {
    pageType,
    userStatus,
    mainContent,
    navigation,
    objectsByFunction,
    confidence,
    summary
  };
}

/**
 * Extract all text from detected objects
 */
function extractAllText(objects: DetectedObject[]): string {
  return objects
    .filter(obj => obj.text)
    .map(obj => obj.text!)
    .join(' ');
}

/**
 * Infer what type of page we're on
 */
function inferPageType(textLower: string, objects: DetectedObject[]): SemanticContext['pageType'] {
  // Check for login indicators
  if (textLower.includes('log in') || textLower.includes('sign up') || textLower.includes('username') || textLower.includes('password')) {
    return 'login';
  }
  
  // Check for search functionality
  if (textLower.includes('search') && (textLower.includes('results') || textLower.includes('find'))) {
    return 'search';
  }
  
  // Check for feed/home content
  if (textLower.includes('feed') || textLower.includes('home') || textLower.includes('timeline')) {
    return 'feed';
  }
  
  // Check for profile
  if (textLower.includes('profile') || textLower.includes('about') || textLower.includes('bio')) {
    return 'profile';
  }
  
  // Check for post content
  if (textLower.includes('post') || textLower.includes('photo') || textLower.includes('video')) {
    return 'post';
  }
  
  return 'home';
}

/**
 * Infer user login status
 */
function inferUserStatus(textLower: string, objects: DetectedObject[]): SemanticContext['userStatus'] {
  // Look for login-related text
  if (textLower.includes('log in') || textLower.includes('sign up') || textLower.includes('create account')) {
    return 'logged_out';
  }
  
  // Look for logged-in indicators
  if (textLower.includes('notifications') || textLower.includes('messages') || textLower.includes('saved')) {
    return 'logged_in';
  }
  
  return 'unknown';
}

/**
 * Infer main content and primary actions
 */
function inferMainContent(objects: DetectedObject[]): SemanticContext['mainContent'] {
  const hasImages = objects.some(obj => obj.label.includes('image') || obj.label.includes('photo') || obj.label.includes('picture'));
  const hasVideos = objects.some(obj => obj.label.includes('video') || obj.label.includes('play'));
  const hasTextBlocks = objects.some(obj => obj.text && obj.text.length > 50);
  const hasForms = objects.some(obj => obj.label.includes('input') || obj.label.includes('form'));
  
  if (hasImages && !hasVideos) return { type: 'image', primaryAction: 'view', escalationPath: 'interact' };
  if (hasVideos) return { type: 'video', primaryAction: 'play', escalationPath: 'watch' };
  if (hasForms) return { type: 'form', primaryAction: 'fill', escalationPath: 'submit' };
  if (hasTextBlocks) return { type: 'text', primaryAction: 'read', escalationPath: 'comment' };
  
  return { type: 'list', primaryAction: 'browse', escalationPath: 'explore' };
}

/**
 * Infer navigation structure
 */
function inferNavigation(objects: DetectedObject[]): SemanticContext['navigation'] {
  // Look for common navigation labels
  const navTexts = ['home', 'feed', 'search', 'notifications', 'messages', 'profile', 'settings', 'menu'];
  const foundNav = navTexts.filter(text => objects.some(obj => (obj.text || '').toLowerCase().includes(text)));
  
  return {
    currentSection: foundNav[0] || 'unknown',
    availableSections: foundNav,
    backHistory: []
  };
}

/**
 * Classify objects by their function
 */
function classifyObjectsByFunction(objects: DetectedObject[]): SemanticContext['objectsByFunction'] {
  const byFunction = {
    likeButtons: [] as DetectedObject[],
    commentButtons: [] as DetectedObject[],
    shareButtons: [] as DetectedObject[],
    navigationItems: [] as DetectedObject[],
    inputFields: [] as DetectedObject[],
    buttons: [] as DetectedObject[],
    textBlocks: [] as DetectedObject[],
    images: [] as DetectedObject[],
    videos: [] as DetectedObject[]
  };
  
  for (const obj of objects) {
    const label = obj.label.toLowerCase();
    const text = (obj.text || '').toLowerCase();
    
    // Classify buttons
    if (label.includes('button') || text.includes('like') || text.includes('heart') || text.includes('comment')) {
      if (text.includes('like') || label.includes('like') || label.includes('heart')) {
        byFunction.likeButtons.push(obj);
      } else if (text.includes('comment') || label.includes('comment')) {
        byFunction.commentButtons.push(obj);
      } else if (text.includes('share') || label.includes('share')) {
        byFunction.shareButtons.push(obj);
      } else {
        byFunction.buttons.push(obj);
      }
    }
    
    // Classify inputs
    else if (label.includes('input') || label.includes('search') || label.includes('field')) {
      byFunction.inputFields.push(obj);
    }
    
    // Classify navigation
    else if (label.includes('nav') || label.includes('menu') || label.includes('bar') || label.includes('tab')) {
      byFunction.navigationItems.push(obj);
    }
    
    // Classify text
    else if (obj.text && obj.text.length > 3) {
      byFunction.textBlocks.push(obj);
    }
    
    // Classify images/videos
    else if (label.includes('image') || label.includes('photo') || label.includes('picture')) {
      byFunction.images.push(obj);
    }
    else if (label.includes('video') || label.includes('play') || label.includes('youtube')) {
      byFunction.videos.push(obj);
    }
  }
  
  return byFunction;
}

/**
 * Calculate confidence in semantic understanding
 */
function calculateConfidence(objects: DetectedObject[], pageType: string, userStatus: string): number {
  let confidence = 0.5;
  
  // Bonus points for having many objects
  if (objects.length > 10) confidence += 0.1;
  if (objects.length > 50) confidence += 0.15;
  if (objects.length > 100) confidence += 0.1;
  
  // Bonus for clear patterns
  if (pageType !== 'general') confidence += 0.1;
  if (userStatus !== 'unknown') confidence += 0.1;
  
  // Bonus for high confidence detections
  const avgConfidence = objects.reduce((sum, obj) => sum + obj.confidence, 0) / objects.length;
  confidence += (avgConfidence - 0.5) * 0.2;
  
  return Math.min(1, Math.max(0, confidence));
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  pageType: string,
  userStatus: string,
  mainContent: any,
  navigation: any
): string {
  return `Page type: ${pageType}, User: ${userStatus}, Content: ${mainContent.type}, Section: ${navigation.currentSection}`;
}

/**
 * Generate intelligent recommendations based on semantic understanding
 */
export function generateRecommendations(visionData: VisionData, goal?: string): SemanticAnalysis['recommendations'] {
  const semantic = buildSemanticContext(visionData);
  const recommendations: SemanticAnalysis['recommendations'] = [];
  
  // Goal-based recommendations
  if (goal?.toLowerCase().includes('like')) {
    if (semantic.objectsByFunction.likeButtons.length > 0) {
      recommendations.push({
        action: 'click',
        confidence: 0.9,
        reasoning: 'Goal: like posts. Found like buttons in the UI.',
        coordinates: {
          x: semantic.objectsByFunction.likeButtons[0].center.x,
          y: semantic.objectsByFunction.likeButtons[0].center.y
        }
      });
    }
  }
  
  if (goal?.toLowerCase().includes('comment')) {
    if (semantic.objectsByFunction.commentButtons.length > 0) {
      recommendations.push({
        action: 'click',
        confidence: 0.9,
        reasoning: 'Goal: comment. Found comment buttons in the UI.',
        coordinates: {
          x: semantic.objectsByFunction.commentButtons[0].center.x,
          y: semantic.objectsByFunction.commentButtons[0].center.y
        }
      });
    }
  }
  
  // Context-based recommendations
  if (semantic.pageType === 'login' && goal) {
    if (semantic.objectsByFunction.inputFields.length >= 2) {
      recommendations.push({
        action: 'fill_form',
        confidence: 0.85,
        reasoning: 'Detected login page with multiple input fields. Should fill credentials.'
      });
    }
  }
  
  if (semantic.userStatus === 'logged_out' && goal?.includes('instagram') || goal?.includes('social')) {
    recommendations.push({
      action: 'navigate_to_login',
      confidence: 0.8,
      reasoning: 'User appears logged out but goal requires social media access.'
    });
  }
  
  // Navigation recommendations
  if (semantic.navigation.availableSections.length > 0 && goal?.includes('go to')) {
    const section = semantic.navigation.availableSections.find(section => 
      goal?.toLowerCase().includes(section.toLowerCase())
    );
    if (section) {
      const navItem = semantic.objectsByFunction.navigationItems.find(item => 
        (item.text || '').toLowerCase().includes(section.toLowerCase())
      );
      if (navItem) {
        recommendations.push({
          action: 'click',
          confidence: 0.85,
          reasoning: `Goal includes navigating to '${section}'. Found navigation item.`,
          coordinates: { x: navItem.center.x, y: navItem.center.y }
        });
      }
    }
  }
  
  return recommendations;
}

/**
 * Enhanced vision data with semantic information
 */
export function enhanceVisionWithSemantic(visionData: VisionData, goal?: string): SemanticAnalysis {
  return {
    original: visionData,
    semantic: buildSemanticContext(visionData, goal),
    recommendations: generateRecommendations(visionData, goal)
  };
}

export default {
  buildSemanticContext,
  generateRecommendations,
  enhanceVisionWithSemantic
};