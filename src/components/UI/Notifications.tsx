/**
 * components/UI/Notifications.tsx
 * Toast notifications del sistema
 */
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useGeoStore } from '../../store/useGeoStore';

export default function Notifications() {
  const { notifications, removeNotification } = useGeoStore();

  if (notifications.length === 0) return null;

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle,
  };

  const colors = {
    success: 'var(--geo-success)',
    error: 'var(--geo-danger)',
    info: 'var(--geo-info)',
    warning: 'var(--geo-amber)',
  };

  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 20,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 1000, pointerEvents: 'none',
    }}>
      {notifications.map((n) => {
        const Icon = icons[n.type];
        const color = colors[n.type];
        return (
          <div
            key={n.id}
            className="fade-in"
            style={{
              background: 'var(--geo-panel)',
              border: `1px solid ${color}40`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: 'var(--shadow-panel)',
              maxWidth: 340,
              pointerEvents: 'all',
            }}
          >
            <Icon size={15} color={color} strokeWidth={2} />
            <span style={{ fontSize: 12, flex: 1, color: 'var(--geo-text)' }}>{n.message}</span>
            <button
              onClick={() => removeNotification(n.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--geo-text-hint)', padding: 2 }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
