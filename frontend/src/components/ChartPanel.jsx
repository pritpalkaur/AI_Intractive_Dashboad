import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Title, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { fmt } from '../chatbot.js';

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip);

const COLOR_SAVED = '#2f6fde';
const COLOR_CHANGED = '#e8890c';

const options = {
  maintainAspectRatio: false,
  animation: { duration: 400 },
  plugins: { legend: { display: false } },
  scales: { y: { beginAtZero: true, title: { display: true, text: 'Price' } } },
};

export default function ChartPanel({ working, savedById, changedIds, dirty, saving, busy, emailTo, onSave, onDiscard }) {
  const data = {
    labels: working.map(d => d.label),
    datasets: [{
      label: 'Price',
      data: working.map(d => d.value),
      backgroundColor: working.map(d => changedIds.has(d.id) ? COLOR_CHANGED : COLOR_SAVED),
      borderRadius: 4,
    }],
  };

  return (
    <section className="panel chart-panel">
      <div className="panel-head">
        <h2>Product Prices</h2>
        <div className="actions">
          <button className="secondary" disabled={!dirty || saving || busy} onClick={onDiscard}>Discard changes</button>
          <button disabled={!dirty || saving || busy} onClick={onSave} title={`A summary email will be sent to ${emailTo}`}>
            {saving ? 'Saving…' : 'Save data'}
          </button>
        </div>
      </div>
      <div className="chart-wrap"><Bar data={data} options={options} /></div>
      <table>
        <thead>
          <tr><th>Product</th><th>Saved price</th><th>Current price</th><th>Updated flag</th></tr>
        </thead>
        <tbody>
          {working.map(d => (
            <tr key={d.id} className={changedIds.has(d.id) ? 'changed' : ''}>
              <td>{d.label}</td>
              <td>{fmt(savedById.get(d.id))}</td>
              <td>{fmt(d.value)}</td>
              <td title={d.updatedAt ? `Last saved ${new Date(d.updatedAt).toLocaleString()}` : ''}>
                {d.isUpdated ? <span className="flag">Updated</span> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
