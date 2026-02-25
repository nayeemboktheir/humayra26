import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { Area, Point } from 'react-easy-crop';

interface ImageCropperProps {
  image: string;
  crop: Point;
  zoom: number;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
}

const ImageCropper = ({ image, crop, zoom, onCropChange, onZoomChange, onCropComplete }: ImageCropperProps) => {
  const [CropperComp, setCropperComp] = useState<any>(null);

  useEffect(() => {
    import('react-easy-crop').then(mod => setCropperComp(() => mod.default));
  }, []);

  if (!CropperComp) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <CropperComp
      image={image}
      crop={crop}
      zoom={zoom}
      aspect={1}
      onCropChange={onCropChange}
      onZoomChange={onZoomChange}
      onCropComplete={onCropComplete}
    />
  );
};

export default ImageCropper;
