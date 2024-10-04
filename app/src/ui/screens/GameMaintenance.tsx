import blobertSolo from "/assets/blobert-solo.svg";
import { Loader2 } from "lucide-react";

export const GameMaintenance = () => (
    <div className="min-h-screen bg-secondary flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-primary shadow-lg rounded-lg p-8 text-center">
            <div className="mb-6">
                <img
                    src={blobertSolo}
                    alt="Maintenance Illustration"
                    className="mx-auto size-40"
                />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-4">Under Maintenance</h1>
            <p className="text-gray-600 mb-6">
                We're currently performing some scheduled maintenance. We'll be back up and running as soon as possible.<br /><br />Thank you for your patience!
            </p>
            <div className="flex items-center justify-center">
                <Loader2 className="animate-spin mr-2" />
                <span>We're working on it...</span>
            </div>
        </div>
    </div>
)