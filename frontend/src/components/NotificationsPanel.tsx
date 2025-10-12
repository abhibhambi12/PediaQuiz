import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getNotifications, markNotificationAsRead } from '@/services/apiService';
import Loader from './Loader';
import { safeToDate } from '@/utils/dateUtils';
import clsx from 'clsx';
import { Notification } from '@pediaquiz/types';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// FIX: Added React.FC type to ensure correct JSX return typing.
const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['userNotifications', user?.uid],
    queryFn: async () =>
      (await getNotifications({ userId: user!.uid })).data.notifications,
    enabled: !!user && isOpen,
  });

  const mutation = useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationAsRead({ notificationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
    },
  });

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-500"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-500"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-500"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white dark:bg-slate-800 shadow-xl">
                    <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
                      <Dialog.Title className="text-xl font-bold flex items-center gap-2">
                        <BellIcon className="h-6 w-6" /> Notifications
                      </Dialog.Title>
                      <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      {isLoading ? (
                        <Loader message="Loading..." />
                      ) : notifications?.length === 0 ? (
                        <p className="text-center text-slate-500 py-4">
                          No new notifications.
                        </p>
                      ) : (
                        notifications?.map((n: Notification) => (
                          <div
                            key={n.id}
                            onClick={() => !n.read && mutation.mutate(n.id)}
                            className={clsx(
                              'p-3 rounded-lg border',
                              !n.read
                                ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-200 dark:border-sky-700 cursor-pointer'
                                : 'border-slate-200 dark:border-slate-700'
                            )}
                          >
                            <p className="font-medium">{n.message}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {safeToDate(n.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};
export default NotificationsPanel;