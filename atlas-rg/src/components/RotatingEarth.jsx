import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export default function RotatingEarth({ width = 560, height = 430, className = "" }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    const containerWidth = Math.min(width, Math.max(280, window.innerWidth * 0.38));
    const containerHeight = Math.min(height, Math.max(280, window.innerHeight * 0.58));
    const radius = Math.min(containerWidth, containerHeight) / 2.45;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    context.scale(dpr, dpr);

    const projection = d3
      .geoOrthographic()
      .scale(radius)
      .translate([containerWidth / 2, containerHeight / 2])
      .clipAngle(90);
    const path = d3.geoPath().projection(projection).context(context);
    const graticule = d3.geoGraticule();
    const rotation = [0, -12];
    let landFeatures = null;
    let autoRotate = true;
    let isDisposed = false;
    const allDots = [];

    function pointInPolygon(point, polygon) {
      const [x, y] = point;
      let inside = false;

      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];

        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }

      return inside;
    }

    function pointInFeature(point, feature) {
      const geometry = feature.geometry;
      if (!geometry) return false;

      if (geometry.type === "Polygon") {
        if (!pointInPolygon(point, geometry.coordinates[0])) return false;
        return !geometry.coordinates.slice(1).some((ring) => pointInPolygon(point, ring));
      }

      if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.some((polygon) => (
          pointInPolygon(point, polygon[0]) &&
          !polygon.slice(1).some((ring) => pointInPolygon(point, ring))
        ));
      }

      return false;
    }

    function generateDotsInPolygon(feature, dotSpacing = 16) {
      const dots = [];
      const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(feature);
      const stepSize = dotSpacing * 0.08;

      for (let lng = minLng; lng <= maxLng; lng += stepSize) {
        for (let lat = minLat; lat <= maxLat; lat += stepSize) {
          const point = [lng, lat];
          if (pointInFeature(point, feature)) dots.push(point);
        }
      }

      return dots;
    }

    function render() {
      context.clearRect(0, 0, containerWidth, containerHeight);
      const currentScale = projection.scale();
      const scaleFactor = currentScale / radius;

      context.beginPath();
      context.arc(containerWidth / 2, containerHeight / 2, currentScale, 0, 2 * Math.PI);
      context.fillStyle = "#050505";
      context.fill();
      context.strokeStyle = "#f4f4f5";
      context.lineWidth = 1.6 * scaleFactor;
      context.stroke();

      context.beginPath();
      path(graticule());
      context.strokeStyle = "#ffffff";
      context.lineWidth = 0.8 * scaleFactor;
      context.globalAlpha = 0.22;
      context.stroke();
      context.globalAlpha = 1;

      if (!landFeatures) return;

      context.beginPath();
      landFeatures.features.forEach((feature) => path(feature));
      context.strokeStyle = "#ffffff";
      context.lineWidth = 0.9 * scaleFactor;
      context.stroke();

      allDots.forEach(([lng, lat]) => {
        const projected = projection([lng, lat]);
        if (
          projected &&
          projected[0] >= 0 &&
          projected[0] <= containerWidth &&
          projected[1] >= 0 &&
          projected[1] <= containerHeight
        ) {
          context.beginPath();
          context.arc(projected[0], projected[1], 1.15 * scaleFactor, 0, 2 * Math.PI);
          context.fillStyle = "#a1a1aa";
          context.fill();
        }
      });
    }

    async function loadWorldData() {
      try {
        const response = await fetch(
          "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/refs/heads/master/110m/physical/ne_110m_land.json",
        );
        if (!response.ok) throw new Error("Failed to load land data");
        const data = await response.json();
        if (isDisposed) return;

        landFeatures = data;
        data.features.forEach((feature) => {
          allDots.push(...generateDotsInPolygon(feature, 16));
        });
        render();
      } catch {
        if (!isDisposed) setError("Failed to load land map data");
      }
    }

    function rotate() {
      if (!autoRotate) return;
      rotation[0] += 0.42;
      projection.rotate(rotation);
      render();
    }

    function handleMouseDown(event) {
      autoRotate = false;
      const startX = event.clientX;
      const startY = event.clientY;
      const startRotation = [...rotation];

      function handleMouseMove(moveEvent) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        rotation[0] = startRotation[0] + dx * 0.5;
        rotation[1] = Math.max(-90, Math.min(90, startRotation[1] - dy * 0.5));
        projection.rotate(rotation);
        render();
      }

      function handleMouseUp() {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        window.setTimeout(() => {
          autoRotate = true;
        }, 10);
      }

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    function handleWheel(event) {
      event.preventDefault();
      const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const nextRadius = Math.max(radius * 0.55, Math.min(radius * 2.25, projection.scale() * scaleFactor));
      projection.scale(nextRadius);
      render();
    }

    projection.rotate(rotation);
    render();
    loadWorldData();
    const rotationTimer = d3.timer(rotate);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      isDisposed = true;
      rotationTimer.stop();
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [width, height]);

  if (error) {
    return (
      <div className={`grid min-h-[320px] place-items-center rounded-2xl border border-zinc-200 bg-zinc-50 p-8 ${className}`}>
        <p className="text-sm font-medium text-zinc-500">{error}</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} aria-label="Rotating Earth visualization">
      <canvas
        ref={canvasRef}
        className="h-auto w-full rounded-2xl bg-transparent"
        style={{ maxWidth: "100%", height: "auto" }}
      />
    </div>
  );
}
