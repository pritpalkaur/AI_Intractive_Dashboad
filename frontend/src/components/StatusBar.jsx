export default function StatusBar({ loading, dirty, savedAt }) {
  const text = loading ? 'Loading…'
    : dirty ? 'Unsaved changes (in memory only)'
    : savedAt ? `All changes saved · ${new Date(savedAt).toLocaleTimeString()}`
    : 'Loaded from database';
  return (
    <div className={`status${dirty ? ' dirty' : ''}`}>
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}
