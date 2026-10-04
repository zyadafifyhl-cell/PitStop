import React from 'react';
import { Modal, Platform, View } from 'react-native';

type Props = {
  visible: boolean;
  onRequestClose?: () => void;
  children: React.ReactNode;
};

/** Renders an overlay above any open RN Modal. Web uses a body portal so alerts are not trapped behind sheets. */
export function OverlayPortal({ visible, onRequestClose, children }: Props) {
  if (Platform.OS === 'web') {
    if (!visible || typeof document === 'undefined') return null;
    const { createPortal } = require('react-dom') as typeof import('react-dom');
    return createPortal(
      <View pointerEvents="box-none" style={webLayerStyle}>
        {children}
      </View>,
      document.body,
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

const webLayerStyle = {
  position: 'fixed' as 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 200000,
  elevation: 200000,
  flex: 1,
};
