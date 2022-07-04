import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";

import { canvasOverlay, CanvasOverlay } from "./plugins/CanvasOverlay";
import PDFRenderer from "./PDFRenderer";
import PixelCRS from "./plugins/PixelCRS";
import PDFExporter, { GeomanLayer } from "./PDFExporter";
import { cloudPolylineRenderer } from "./plugins/CloudPolyline";
import Measurements from "./plugins/Measure";

import "./style.css";

/// CONSTANTS
const PAGE_NUMBER = 1;
const ACTUAL_LENGTH = "20m";

/// GLOBALS
const cloudRenderer = cloudPolylineRenderer();
let pdfRenderer: PDFRenderer;
let exporter: PDFExporter;
let overlay: CanvasOverlay;
let measurements: Measurements;

/// ELEMENTS
const inputEl = document.querySelector<HTMLInputElement>("#pdf-input")!;
const downloadBtn = document.querySelector<HTMLButtonElement>("#download-btn")!;

/// INIT
const map = L.map("map", {
  zoom: -2,
  minZoom: -2,
  maxZoom: 2,
  crs: PixelCRS,
});

/// HANDLERS
async function onZoom() {
  if (!overlay) {
    return;
  }

  const canvas = await pdfRenderer.renderPage(map.getZoom());
  overlay.setCanvas(canvas);
}

function onCalibrate(length: number) {
  measurements.adjustScale(length, ACTUAL_LENGTH);
}

async function onFileLoad(result: ArrayBuffer, name: string) {
  const typedArray = new Uint8Array(result);

  pdfRenderer = new PDFRenderer({
    file: typedArray,
    pageNumber: PAGE_NUMBER,
    minZoom: map.getMinZoom(),
  });

  const canvas = await pdfRenderer.renderPage(map.getZoom());
  const bounds: L.LatLngBoundsExpression = [
    [0, 0],
    [canvas.height, canvas.width],
  ];

  overlay = canvasOverlay(canvas, L.latLngBounds(bounds)).addTo(map);
  exporter = new PDFExporter({
    file: typedArray,
    name,
    canvasWidth: canvas.width,
  });

  map.setView([canvas.height / 2, canvas.width / 2]);
  map.pm.addControls({
    position: "topleft",
    drawCircleMarker: false,
    cutPolygon: false,
  });

  map.pm.setGlobalOptions({
    allowSelfIntersection: false,
  });

  const cloudActions = [
    "finish" as const,
    "removeLastVertex" as const,
    "cancel" as const,
  ];

  map.pm.Toolbar.copyDrawControl("Polygon", {
    name: "CloudPolygon",
    block: "draw",
    title: "Draw Revision Cloud",
    className: "leaflet-cloud-icon",
    actions: cloudActions,
  });

  map.pm.enableDraw("CloudPolygon", {
    pathOptions: { renderer: cloudRenderer },
    hintlineStyle: { color: "#3388ff", renderer: cloudRenderer },
    templineStyle: { renderer: cloudRenderer },
    allowSelfIntersection: false,
  });
  map.pm.disableDraw();

  const page = await exporter.getPage(PAGE_NUMBER - 1);
  measurements = new Measurements(map, page, canvas.width, onCalibrate);
}

function onFileChange() {
  const file = inputEl.files?.[0];
  if (!file) {
    return;
  }

  const fileReader = new FileReader();
  fileReader.onload = function handleLoad() {
    onFileLoad(this.result as ArrayBufferLike, file.name);
  };
  fileReader.readAsArrayBuffer(file);
}

async function onDownloadClick() {
  if (!exporter) {
    return;
  }

  const layers = map.pm.getGeomanLayers() as GeomanLayer[];
  await exporter.drawLayers(layers, PAGE_NUMBER - 1);
  await exporter.downloadPdf();
}

/// EVENT LISTENERS
inputEl.addEventListener("change", onFileChange);
downloadBtn.addEventListener("click", onDownloadClick);
map.on("zoomend", onZoom);