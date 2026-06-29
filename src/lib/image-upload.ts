export function read_image_file(file: File, max_size_mb = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('нужен файл изображения'));
      return;
    }
    if (file.size > max_size_mb * 1024 * 1024) {
      reject(new Error(`файл больше ${max_size_mb} мб`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}
