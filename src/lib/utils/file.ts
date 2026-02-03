export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isGifFile(file: File): boolean {
	return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
}

export function isVideoFile(file: File): boolean {
	if (file.type.startsWith('video/')) return true;
	const ext = file.name.split('.').pop()?.toLowerCase();
	return ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'ogv'].includes(ext ?? '');
}

export function isImageFile(file: File): boolean {
	if (file.type.startsWith('image/') && file.type !== 'image/gif') return true;
	const ext = file.name.split('.').pop()?.toLowerCase();
	return ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext ?? '');
}
