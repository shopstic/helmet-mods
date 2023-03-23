import { GrafanaDashboard } from "./libs/types.ts";

const sample: GrafanaDashboard = {
  apiVersion: "shopstic.com/v1",
  kind: "GrafanaDashboard",
  metadata: {
    name: "test-dashboard",
    namespace: "exp",
    labels: {
      "grafana-syncer.shopstic.com/foo": "bar",
    },
  },
  spec: {
    dashboard: {
      "annotations": {
        "list": [
          {
            "builtIn": 1,
            "datasource": {
              "type": "grafana",
              "uid": "-- Grafana --",
            },
            "enable": true,
            "hide": true,
            "iconColor": "rgba(0, 211, 255, 1)",
            "name": "Annotations & Alerts",
            "target": {
              "limit": 100,
              "matchAny": false,
              "tags": [],
              "type": "dashboard",
            },
            "type": "dashboard",
          },
        ],
      },
      "editable": true,
      "fiscalYearStartMonth": 0,
      "graphTooltip": 0,
      "id": 38,
      "links": [],
      "liveNow": false,
      "panels": [
        {
          "datasource": {
            "type": "prometheus",
            "uid": "uWkrqtk4k",
          },
          "fieldConfig": {
            "defaults": {
              "color": {
                "mode": "palette-classic",
              },
              "custom": {
                "axisCenteredZero": false,
                "axisColorMode": "text",
                "axisLabel": "",
                "axisPlacement": "auto",
                "barAlignment": 0,
                "drawStyle": "line",
                "fillOpacity": 0,
                "gradientMode": "none",
                "hideFrom": {
                  "legend": false,
                  "tooltip": false,
                  "viz": false,
                },
                "lineInterpolation": "linear",
                "lineWidth": 1,
                "pointSize": 5,
                "scaleDistribution": {
                  "type": "linear",
                },
                "showPoints": "auto",
                "spanNulls": false,
                "stacking": {
                  "group": "A",
                  "mode": "none",
                },
                "thresholdsStyle": {
                  "mode": "off",
                },
              },
              "mappings": [],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null,
                  },
                  {
                    "color": "red",
                    "value": 80,
                  },
                ],
              },
            },
            "overrides": [],
          },
          "gridPos": {
            "h": 9,
            "w": 12,
            "x": 0,
            "y": 0,
          },
          "id": 2,
          "options": {
            "legend": {
              "calcs": [],
              "displayMode": "list",
              "placement": "bottom",
              "showLegend": true,
            },
            "tooltip": {
              "mode": "single",
              "sort": "none",
            },
          },
          "targets": [
            {
              "datasource": {
                "type": "prometheus",
                "uid": "uWkrqtk4k",
              },
              "editorMode": "code",
              "expr": "vector(519)",
              "legendFormat": "__auto",
              "range": true,
              "refId": "A",
            },
          ],
          "title": "Test",
          "type": "timeseries",
        },
      ],
      "refresh": "",
      // "revision": 1,
      "schemaVersion": 38,
      "style": "dark",
      "tags": [],
      "templating": {
        "list": [],
      },
      "time": {
        "from": "now-6h",
        "to": "now",
      },
      "timepicker": {},
      "timezone": "",
      "title": "Test",
      // "version": 1,
      "weekStart": "",
    },
    folderUid: "SrwRZNfVz",
  },
};

console.log(JSON.stringify(sample));
