// Utility Functions

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function truncateTitle(title, maxLength) {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength) + '...';
}

export function convertEmojiPlaceholders(text) {
  const emojiMap = {
    'EMOJI_0': '👋', 'EMOJI_1': '😊', 'EMOJI_2': '💼', 'EMOJI_3': '🎯',
    'EMOJI_4': '✨', 'EMOJI_5': '🚀', 'EMOJI_6': '💡', 'EMOJI_7': '🔥',
    'EMOJI_8': '⭐', 'EMOJI_9': '🎓', 'EMOJI_10': '💻', 'EMOJI_11': '📱',
    'EMOJI_12': '🌟', 'EMOJI_13': '👍', 'EMOJI_14': '✅', 'EMOJI_15': '📊',
    'EMOJI_16': '📈', 'EMOJI_17': '🎨', 'EMOJI_18': '🔧', 'EMOJI_19': '⚡',
    'EMOJI_20': '🏆'
  };
  
  let result = text;
  Object.entries(emojiMap).forEach(([placeholder, emoji]) => {
    const regex = new RegExp(placeholder, 'g');
    result = result.replace(regex, emoji);
  });
  
  return result;
}

export function getDynamicGreeting() {
  const now = new Date();
  const hour = now.getHours();
  
  if (hour >= 0 && hour < 5) {
    return 'Working late';
  } else if (hour >= 5 && hour < 12) {
    return 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'Good evening';
  } else {
    return 'Good evening';
  }
}

export function getChatDateCategory(timestamp) {
  if (!timestamp) return 'Older';
  
  const chatDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayMidnight = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  const chatMidnight = new Date(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());
  
  if (chatMidnight.getTime() === todayMidnight.getTime()) {
    return 'Today';
  } else if (chatMidnight.getTime() === yesterdayMidnight.getTime()) {
    return 'Yesterday';
  } else {
    const options = { month: 'long', day: 'numeric', year: 'numeric' };
    return chatDate.toLocaleDateString('en-US', options);
  }
}

export function groupChatsByDate(chats) {
  const groups = {};
  
  chats.forEach((chat, index) => {
    const category = getChatDateCategory(chat.timestamp);
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push({ chat, index });
  });
  
  return groups;
}

export function getDateOrder(groups) {
  const dateOrder = [];
  
  if (groups['Today']) dateOrder.push('Today');
  if (groups['Yesterday']) dateOrder.push('Yesterday');
  
  const otherDates = Object.keys(groups).filter(
    date => date !== 'Today' && date !== 'Yesterday' && date !== 'Older'
  ).sort((a, b) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateB - dateA;
  });
  
  dateOrder.push(...otherDates);
  
  if (groups['Older']) dateOrder.push('Older');
  
  return dateOrder;
}