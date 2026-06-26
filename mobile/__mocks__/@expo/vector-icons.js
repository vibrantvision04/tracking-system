// Mock for @expo/vector-icons used in tests
const React = require('react');

function createMockIcon(name) {
  const MockIcon = (props) => {
    return React.createElement('Text', {
      ...props,
      testID: props.testID || `icon-${name}`,
    }, props.name || '');
  };
  MockIcon.displayName = name;
  return MockIcon;
}

module.exports = {
  Ionicons: createMockIcon('Ionicons'),
  MaterialIcons: createMockIcon('MaterialIcons'),
  FontAwesome: createMockIcon('FontAwesome'),
  AntDesign: createMockIcon('AntDesign'),
  Entypo: createMockIcon('Entypo'),
  Feather: createMockIcon('Feather'),
  MaterialCommunityIcons: createMockIcon('MaterialCommunityIcons'),
};
