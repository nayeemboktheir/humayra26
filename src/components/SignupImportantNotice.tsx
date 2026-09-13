import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "tradeon_signup_notice_pending";
const OPEN_EVENT = "tradeon:open-signup-notice";

export const markSignupNoticePending = () => {
  window.localStorage.setItem(STORAGE_KEY, "1");
  window.dispatchEvent(new Event(OPEN_EVENT));
};

const questions = [
  {
    title: "Website-এ দেখানো product price-এর বাইরে কি আর কোনো charge দিতে হবে?",
    content: (
      <>
        <p>জি। Website-এ প্রদর্শিত product price-এর সাথে সাধারণত নিচের খরচগুলো প্রযোজ্য হবে:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li><strong>Product price:</strong> China-এর factory/supplier-এর product price।</li>
          <li><strong>China domestic courier charge:</strong> Factory/supplier থেকে আমাদের China warehouse পর্যন্ত delivery charge।</li>
          <li><strong>International shipping charge:</strong> China থেকে আমাদের Dhaka warehouse পর্যন্ত shipment cost, যা shipment-এর ধরন ও প্রতি কেজি (KG) rate অনুযায়ী হিসাব করা হবে।</li>
        </ol>
        <p>International shipment-এর VAT, Tax, documentation এবং অন্যান্য সংশ্লিষ্ট logistics costs আমাদের নির্ধারিত shipping rate-এর মধ্যে অন্তর্ভুক্ত থাকবে। অর্ডারের আগে total payable cost এবং applicable shipping cost জানতে পারবেন।</p>
      </>
    ),
  },
  {
    title: "Dhaka warehouse থেকে product না নিয়ে Home Delivery নিতে চাইলে কি অতিরিক্ত charge হবে?",
    content: <p>জি। Dhaka warehouse থেকে সরাসরি product collect করলে আমাদের পক্ষ থেকে কোনো additional delivery charge থাকবে না। Home Delivery চাইলে warehouse থেকে আপনার address পর্যন্ত courier charge আপনাকে বহন করতে হবে। আমরা সাধারণত Steadfast Courier ব্যবহার করি। Parcel-এর weight ও location অনুযায়ী charge পরিবর্তিত হতে পারে। সাধারণভাবে ১ KG-এর জন্য প্রায় ৳120–৳150 এবং পরবর্তী প্রতি KG-এর জন্য আনুমানিক ৳15–৳20 হতে পারে।</p>,
  },
  {
    title: "Product order করার পর কি supplier-এর price পরিবর্তন হতে পারে?",
    content: <p>হ্যাঁ, কিছু ক্ষেত্রে supplier-এর price পরিবর্তিত হতে পারে।</p>,
  },
  {
    title: "Minimum Order Quantity (MOQ) আছে কি?",
    content: <p>Product ও supplier অনুযায়ী MOQ আলাদা হতে পারে। আমাদের নিজস্ব কোনো MOQ নেই। কিছু product ১ piece দিয়েও order করা সম্ভব, আবার কিছু factory/supplier নির্দিষ্ট quantity ছাড়া order নেয় না।</p>,
  },
  {
    title: "Product available না থাকলে কী হবে?",
    content: <p>Product unavailable হলে অথবা supplier order গ্রহণ না করলে আপনাকে জানানো হবে এবং প্রয়োজন অনুযায়ী alternative supplier/product খোঁজার সুযোগ থাকবে। না পাওয়া গেলে সম্পূর্ণ টাকা refund করা হবে।</p>,
  },
  {
    title: "Product পাওয়ার আগে কি Quality Check করা হয়?",
    content: <p>জি। Order-এর ধরন ও value অনুযায়ী আমাদের tiered quality control system রয়েছে। ছোট order-এর ক্ষেত্রে photo/video verification, supplier communication এবং available digital verification করা যেতে পারে। Large order-এর ক্ষেত্রে প্রয়োজন অনুযায়ী আলাদা charge-এ physical/on-site inspection arrange করা যেতে পারে।</p>,
  },
  {
    title: "Product খারাপ/ভুল হলে কী হবে?",
    content: <p>Wrong item, missing quantity, visible damage বা confirmed quality issue পাওয়া গেলে দ্রুত আমাদের জানাতে হবে। আমরা supplier-এর সাথে যোগাযোগ করে সমাধানের প্রয়োজনীয় support দেব। Return, replacement বা refund supplier-এর policy এবং case-এর nature অনুযায়ী নির্ধারিত হবে।</p>,
  },
  {
    title: "International shipping charge কীভাবে হিসাব করা হয়?",
    content: <p>Product-এর actual/chargeable weight, shipment method, destination এবং applicable logistics rate অনুযায়ী হিসাব করা হয়। China থেকে Dhaka shipment-এর applicable per-KG rate অর্ডারের ধরন অনুযায়ী জানানো হবে। একটি box-এর সর্বনিম্ন weight charge ১০০ গ্রাম।</p>,
  },
  {
    title: "China থেকে Dhaka আসতে কতদিন সময় লাগে?",
    content: <p>Delivery time product availability, supplier processing, China warehouse receiving, consolidation এবং shipping method-এর ওপর নির্ভর করে। আমাদের China warehouse-এ receive হওয়ার পর আনুমানিক ৭–১৫ দিন লাগতে পারে; fixed delivery time guarantee করা হয় না।</p>,
  },
  {
    title: "আমি কি শুধু product কিনতে পারব, নাকি shipping-ও নিতে হবে?",
    content: <p>প্রয়োজন অনুযায়ী শুধু sourcing/procurement অথবা sourcing-এর সাথে international shipping, consolidation এবং delivery-related services নিতে পারবেন।</p>,
  },
  {
    title: "Product-এর price বা shipping নিয়ে কি আগে থেকে জানতে পারব?",
    content: <p>অবশ্যই। Order confirm করার আগে applicable costs review করার সুযোগ থাকবে, যেন আপনি কোন কোন cost-এর জন্য payment করছেন তা বুঝতে পারেন।</p>,
  },
  {
    title: "Website-এ Order করার সময় কি কোনো payment করতে হবে? Payment কীভাবে করব?",
    content: (
      <>
        <p>জি। Website-এ order করার সময় minimum 70% payment করতে হবে। “Buy Now” থেকে payment page-এ গিয়ে secure payment gateway-এর মাধ্যমে payment করা যাবে।</p>
        <p><strong>Available methods:</strong> Bank Payment, bKash, Nagad, Visa/Mastercard এবং অন্যান্য available digital payment methods। বাকি 30% product আসার পরে পরিশোধ করতে পারবেন।</p>
      </>
    ),
  },
];

const SignupImportantNotice = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const showIfPending = () => setOpen(window.localStorage.getItem(STORAGE_KEY) === "1");
    showIfPending();
    window.addEventListener(OPEN_EVENT, showIfPending);
    return () => window.removeEventListener(OPEN_EVENT, showIfPending);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="border-b bg-primary/5 px-5 py-5 pr-12 text-left sm:px-7">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-xl leading-snug text-foreground">অর্ডার করার আগে গুরুত্বপূর্ণ তথ্য ও সাধারণ প্রশ্ন</DialogTitle>
              <DialogDescription className="mt-1 font-medium text-destructive">অর্ডার করার আগে অবশ্যই পড়ুন!</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm leading-7 text-muted-foreground sm:px-7">
          {questions.map((item, index) => (
            <section key={item.title} className="border-b pb-5 last:border-b-0 last:pb-0">
              <h3 className="mb-2 font-semibold leading-6 text-foreground">{index + 1}. {item.title}</h3>
              <div className="space-y-2">{item.content}</div>
            </section>
          ))}
        </div>

        <DialogFooter className="border-t bg-background px-5 py-4 sm:px-7">
          <Button className="w-full gap-2 sm:w-auto" onClick={() => handleOpenChange(false)}>
            <CheckCircle2 className="h-4 w-4" />
            আমি পড়েছি ও বুঝেছি
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SignupImportantNotice;