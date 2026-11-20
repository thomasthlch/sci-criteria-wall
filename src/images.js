import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase.js";
import { assertStoragePath } from "./paths.js";

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;

export function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("請上載圖片檔案。"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("讀取相片失敗。"));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("這張相片讀取唔到，請改用 JPG 或 PNG。"));
              return;
            }
            if (blob.size >= 5 * 1024 * 1024) {
              reject(new Error("相片縮圖仍然超過 5MB，請改用較細的圖片。"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      };
      image.onerror = () => reject(new Error("這張相片讀取唔到，請改用 JPG 或 PNG。"));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadCasePhoto(uid, file) {
  const blob = await resizeImageFile(file);
  const safeUid = String(uid || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  if (!safeUid) throw new Error("未登入，未能上載相片。");
  const path = assertStoragePath(`sci_criteria_wall/${safeUid}/${crypto.randomUUID()}.jpg`);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  const downloadURL = await getDownloadURL(storageRef);
  return { storagePath: path, downloadURL };
}

export async function deleteStoredPhoto(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, assertStoragePath(path)));
  } catch (error) {
    console.warn("刪除 Storage 相片失敗", error);
  }
}
