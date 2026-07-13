const DIARY_PHOTO_PREFIX = "data:image/jpeg;base64,";
const DIARY_PHOTO_MAX_DATA_URL_LENGTH = 1500000;
const DIARY_PHOTO_TARGET_BYTES = 500 * 1024;
const DIARY_STORAGE_WARNING_BYTES = 4.5 * 1024 * 1024;

function serializedByteSize(value) {
  return new Blob([value]).size;
}

function validateDiaryPhoto(photo, label = "照片") {
  if (photo === undefined || photo === null) return null;
  if (!photo || typeof photo !== "object" || Array.isArray(photo)) throw new Error(`${label}格式無效`);
  if (typeof photo.dataUrl !== "string" || !photo.dataUrl.startsWith(`${DIARY_PHOTO_PREFIX}/9j/`)) {
    throw new Error(`${label}必須是 JPEG 圖片`);
  }
  if (photo.dataUrl.length > DIARY_PHOTO_MAX_DATA_URL_LENGTH) throw new Error(`${label}資料過大`);
  const base64 = photo.dataUrl.slice(DIARY_PHOTO_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error(`${label}Base64 資料無效`);
  if (typeof photo.originalName !== "string" || photo.originalName.length > 200) throw new Error(`${label}檔名無效`);
  for (const field of ["size", "width", "height"]) {
    if (typeof photo[field] !== "number" || !Number.isFinite(photo[field]) || photo[field] <= 0) {
      throw new Error(`${label}${field} 必須是有限正數`);
    }
  }
  if (!Number.isInteger(photo.size) || !Number.isInteger(photo.width) || !Number.isInteger(photo.height)) {
    throw new Error(`${label}尺寸必須是整數`);
  }
  return { dataUrl: photo.dataUrl, originalName: photo.originalName, size: photo.size, width: photo.width, height: photo.height };
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("瀏覽器無法輸出 JPEG 圖片")), "image/jpeg", quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("無法讀取壓縮後的照片"));
    reader.readAsDataURL(blob);
  });
}

async function loadPhotoBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Older Safari does not accept imageOrientation; Image below still applies EXIF orientation.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("無法解碼這張照片"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressDiaryPhoto(file) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) throw new Error("請選擇有效的圖片檔案");
  const bitmap = await loadPhotoBitmap(file);
  try {
    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("無法判斷照片尺寸");
    let scale = Math.min(1, 1200 / Math.max(sourceWidth, sourceHeight));
    let quality = 0.72;
    let result = null;
    let width = 0;
    let height = 0;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      width = Math.max(1, Math.round(sourceWidth * scale));
      height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("瀏覽器無法處理照片");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      result = await canvasToJpeg(canvas, quality);
      if (result.size <= DIARY_PHOTO_TARGET_BYTES) break;
      if (quality > 0.48) quality = Math.max(0.48, quality - 0.08);
      else scale *= 0.82;
    }

    if (!result) throw new Error("照片壓縮失敗");
    const dataUrl = await blobToDataUrl(result);
    const photo = { dataUrl, originalName: String(file.name || "photo.jpg").slice(0, 200), size: result.size, width, height };
    return validateDiaryPhoto(photo);
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}

function createPhotoController(prefix, reportError) {
  const input = document.querySelector(`#${prefix}PhotoInput`);
  const previewWrap = document.querySelector(`#${prefix}PhotoPreviewWrap`);
  const preview = document.querySelector(`#${prefix}PhotoPreview`);
  const removeButton = document.querySelector(`#${prefix}PhotoRemove`);
  const status = document.querySelector(`#${prefix}PhotoStatus`);
  let photo = null;
  let processing = false;
  let processingFailed = false;
  let operationId = 0;

  function render() {
    const valid = photo ? validateDiaryPhoto(photo) : null;
    previewWrap.hidden = !valid;
    if (valid) preview.src = valid.dataUrl;
    else preview.removeAttribute("src");
  }

  input.addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    const currentOperation = ++operationId;
    processing = true;
    processingFailed = false;
    status.textContent = "正在壓縮照片…";
    try {
      const compressed = await compressDiaryPhoto(file);
      if (currentOperation !== operationId) return;
      photo = compressed;
      render();
      status.textContent = photo.size > DIARY_PHOTO_TARGET_BYTES ? "照片已盡量壓縮。" : "照片已壓縮並準備儲存。";
    } catch (error) {
      if (currentOperation !== operationId) return;
      processingFailed = true;
      status.textContent = "照片處理失敗。";
      reportError(error instanceof Error ? error.message : "照片處理失敗");
    } finally {
      if (currentOperation === operationId) processing = false;
      input.value = "";
    }
  });

  removeButton.addEventListener("click", () => {
    operationId += 1;
    photo = null;
    processing = false;
    processingFailed = false;
    status.textContent = "照片已移除；儲存日記後才會套用變更。";
    render();
  });

  return {
    getPhoto() {
      if (processing) throw new Error("照片仍在處理中，請稍候再儲存日記");
      if (processingFailed) throw new Error("照片處理失敗，請移除照片或重新選擇後再儲存日記");
      return photo ? { ...photo } : null;
    },
    setPhoto(value) {
      operationId += 1;
      photo = validateDiaryPhoto(value);
      processing = false;
      processingFailed = false;
      status.textContent = "";
      render();
    },
    reset() {
      operationId += 1;
      photo = null;
      processing = false;
      processingFailed = false;
      input.value = "";
      status.textContent = "";
      render();
    }
  };
}
