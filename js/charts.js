// Relies on the global Chart object loaded via CDN in index.html.

let activeChart = null;

function bucketLog(pointsLog, range) {
  const now = new Date();
  const buckets = new Map();
  let start;
  let keyFn;
  let labelFn;

  if (range === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - 6);
    keyFn = (d) => d.toISOString().slice(0, 10);
    labelFn = (d) => d.toLocaleDateString(undefined, { weekday: "short" });
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.set(keyFn(d), { label: labelFn(d), total: 0 });
    }
  } else if (range === "month") {
    start = new Date(now);
    start.setDate(now.getDate() - 29);
    keyFn = (d) => d.toISOString().slice(0, 10);
    labelFn = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.set(keyFn(d), { label: labelFn(d), total: 0 });
    }
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    keyFn = (d) => `${d.getFullYear()}-${d.getMonth()}`;
    labelFn = (d) => d.toLocaleDateString(undefined, { month: "short" });
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      buckets.set(keyFn(d), { label: labelFn(d), total: 0 });
    }
  }

  pointsLog.forEach((entry) => {
    if (!entry.createdAt || !entry.createdAt.toDate) return;
    const d = entry.createdAt.toDate();
    if (d < start) return;
    const key = keyFn(d);
    if (buckets.has(key)) buckets.get(key).total += entry.amount || 0;
  });

  return {
    labels: [...buckets.values()].map((b) => b.label),
    data: [...buckets.values()].map((b) => b.total),
  };
}

export function renderPointsChart(canvas, pointsLog, range) {
  const { labels, data } = bucketLog(pointsLog, range);
  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }
  activeChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Punti guadagnati",
          data,
          backgroundColor: "#C9A227",
          borderColor: "#8a6e18",
          borderWidth: 1,
          borderRadius: 3,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#5B1A2B", font: { family: "'Space Mono', monospace", size: 10 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#8a7355", precision: 0 },
          grid: { color: "#e8dfc8" },
        },
      },
    },
  });
}
