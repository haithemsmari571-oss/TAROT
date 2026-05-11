import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import UserModal from "../../../components/modals/UserModal";
import ViewUserModal from "../../../components/modals/ViewUserModal";
import DeleteModal from "../../../components/modals/DeleteModal";
import PrimarySelect from "../../../components/CustomInputs/PrimarySelect";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useUsers } from "../hooks/useUsers";
import { Role, UserStatus } from "../types/user.types";
import type { AdminUserListItem } from "../types/user.types";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const Users = () => {
  const { 
    users: usersData, 
    loading, 
    error, 
    fetchUsers, 
    deleteUser,
    createUser,
    updateUser,
    verifyUser 
  } = useUsers();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewUser, setViewUser] = useState<AdminUserListItem | null>(null);
  
  // --- Deletion State ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToPurge, setUserToPurge] = useState<AdminUserListItem | null>(null);
  
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "All">("All");
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce search to avoid too many API calls
  const debouncedSearch = useDebounce(search, 500);

  // Fetch users on component mount and when filters change
  useEffect(() => {
    const filters = {
      search: debouncedSearch || undefined,
      role: roleFilter !== "All" ? roleFilter : undefined,
      page: currentPage,
      limit: 20,
    };
    fetchUsers(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, roleFilter, currentPage]);

  const users = usersData?.users || [];
  const totalUsers = usersData?.total || 0;

  const handleSaveUser = async (userData: any) => {
    try {
      if (selectedUser) {
        // Update existing user
        await updateUser(selectedUser.id, {
          username: userData.username,
          email: userData.email,
          bio: userData.bio,
        });
      } else {
        // Create new user
        await createUser({
          username: userData.username,
          email: userData.email,
          password: userData.password || "TempPassword123!", // Default password
          role: userData.role || Role.USER,
          bio: userData.bio,
        });
      }
      setIsModalOpen(false);
      setSelectedUser(null);
    } catch (err: any) {
      console.error("Failed to save user:", err);
      const errorMessage = err.response?.data?.detail || err.message || "Failed to save user";
      alert(`Error: ${errorMessage}`);
    }
  };

  // --- Logic: Finalizing Purge ---
  const handleConfirmPurge = async () => {
    if (userToPurge) {
      try {
        await deleteUser(userToPurge.id);
        setIsDeleteModalOpen(false);
        setUserToPurge(null);
      } catch (err: any) {
        console.error("Failed to delete user:", err);
        const errorMessage = err.response?.data?.detail || err.message || "Failed to delete user";
        alert(`Error: ${errorMessage}`);
      }
    }
  };

  // Handle verify user
  const handleVerifyUser = async (userId: number) => {
    try {
      await verifyUser(userId);
      setIsModalOpen(false);
      setSelectedUser(null);
    } catch (err: any) {
      console.error("Failed to verify user:", err);
      const errorMessage = err.response?.data?.detail || err.message || "Failed to verify user";
      alert(`Error: ${errorMessage}`);
      throw err; // Re-throw so the modal can handle the loading state
    }
  };

  const columns: Column<AdminUserListItem>[] = [
    {
      key: "username",
      label: "Identity / ID",
      sortable: true,
      render: (user) => (
        <div className="flex items-center gap-4">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] border transition-all hover:scale-110"
            style={{ 
                backgroundColor: `rgba(255,255,255,0.02)`, 
                borderColor: `rgba(255,255,255,0.05)`,
                color: COLORS.primary,
                fontFamily: TYPOGRAPHY.fontFamily.heading
            }}
          >
            {user.profile_picture_path ? (
              <img src={user.profile_picture_path} alt={user.username} className="w-full h-full object-cover rounded-xl" />
            ) : (
              user.username.substring(0, 2).toUpperCase()
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold leading-tight" style={{ fontSize: TYPOGRAPHY.fontSize.sm }}>{user.username}</span>
            <span style={{ color: COLORS.neutralGray, fontSize: '9px' }} className="uppercase font-black tracking-widest opacity-40">ID-{user.id}</span>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (user) => (
        <div className="flex items-center gap-2">
           <Icon icon="solar:crown-minimalistic-bold-duotone" className="text-sm" style={{ color: user.role === Role.ADMIN || user.role === Role.SUPERADMIN ? COLORS.primary : COLORS.neutralGray }} />
           <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
             {user.role}
           </span>
        </div>
      )
    },
    {
      key: "balance",
      label: "Balance",
      sortable: true,
      render: (user) => (
        <div className="flex flex-col">
          <span className="text-white font-bold text-xs">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(user.balance / 100)}
          </span>
          <span className="text-[9px] text-white/20 uppercase font-black">{user.email}</span>
        </div>
      )
    },
    {
      key: "is_verified",
      label: "Verification",
      sortable: true,
      render: (user) => {
        return (
          <div className="flex flex-col gap-1.5 w-24">
             <div className="flex items-center gap-2">
                <div 
                  className="w-1 h-1 rounded-full" 
                  style={{ 
                    backgroundColor: user.is_verified ? COLORS.primary : COLORS.starGold,
                    boxShadow: `0 0 6px ${user.is_verified ? COLORS.primary : COLORS.starGold}`
                  }} 
                />
                <span 
                  className="text-[9px] font-black uppercase tracking-widest"
                  style={{ color: user.is_verified ? COLORS.primary : COLORS.starGold }}
                >
                  {user.is_verified ? "Verified" : "Pending"}
                </span>
             </div>
          </div>
        )
      }
    },
    {
      key: "status",
      label: "State",
      render: (user) => {
        const color = user.status === UserStatus.ACTIVE ? COLORS.primary : COLORS.starGold;
        return (
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
            <span style={{ color, fontSize: '9px' }} className="font-black uppercase tracking-widest">{user.status}</span>
          </div>
        );
      }
    }
  ];

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      
      {/* Header */}
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
            User <span style={{ color: COLORS.primary }}>Management</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-[0.5em] mt-2 opacity-50">
            Manage Users, Roles and Permissions
          </p>
        </div>
        <div className="flex items-center gap-4 text-white/10 font-black text-[9px] uppercase tracking-widest">
            <span>Total Users: {totalUsers}</span>
            <div className="w-[1px] h-4 bg-white/10" />
            <span>Active Users: {users.filter(u => u.status === UserStatus.ACTIVE).length}</span>
        </div>
      </div>

      {/* Controls Container */}
      <div 
        className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-10 shadow-2xl backdrop-blur-sm"
        style={{ backgroundColor: `${COLORS.surface}80` }}
      >
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[9px] font-black uppercase text-white/20 mb-3 ml-1 tracking-[0.3em]">Search Users</label>
          <PrimaryInput 
             fullWidth
             placeholder="Search by username or email..."
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             iconLeft={<Icon icon="solar:magnifer-linear" className="text-xl opacity-20" />}
          />
        </div>

        <div className="w-64">
          <PrimarySelect 
            label="Filter by Role"
            value={roleFilter}
            options={[
              { label: "All Roles", value: "All" },
              { label: "User", value: Role.USER },
              { label: "Psychic", value: Role.PSYCHIC },
              { label: "Admin", value: Role.ADMIN },
              { label: "Superadmin", value: Role.SUPERADMIN },
            ]}
            onChange={(value) => setRoleFilter(value as Role | "All")}
          />
        </div>

        <button 
          onClick={() => { setSelectedUser(null); setIsModalOpen(true); }}
          className="h-[52px] px-12 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] transition-all hover:scale-[1.02] active:scale-95 shadow-xl group"
          style={{ 
            backgroundColor: COLORS.primary, 
            color: COLORS.dark,
            fontFamily: TYPOGRAPHY.fontFamily.heading
          }}
        >
          <span className="flex items-center gap-2">
            Add User
            <Icon icon="solar:add-circle-bold" className="text-lg group-hover:rotate-90 transition-transform" />
          </span>
        </button>
      </div>

      {/* Loading/Error States */}
      {loading && (
        <div className="text-center py-12">
          <Icon icon="solar:load-minimalistic-bold-duotone" className="text-4xl text-primary animate-spin mx-auto mb-4" />
          <p className="text-white/40 text-sm uppercase tracking-widest">Loading users...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-12 px-6 rounded-2xl border border-red-500/20 bg-red-500/5">
          <Icon icon="solar:danger-triangle-bold-duotone" className="text-4xl text-red-500 mx-auto mb-4" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Table Section */}
      {!loading && !error && (
        <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
          <PrimaryTable
            title="ALL USERS"
            data={users}
            columns={columns}
            searchEnabled={false}
            actionsColumn={(user) => (
            <div className="flex items-center justify-end gap-1 pr-4">
              <button 
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => { setViewUser(user); setIsViewModalOpen(true); }}
                title="View Details"
              >
                <Icon icon="solar:eye-bold-duotone" className="text-lg" />
              </button>

              <button 
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => { setSelectedUser(user); setIsModalOpen(true); }}
                title="Edit User"
              >
                <Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" />
              </button>

              <button 
                className="p-3 rounded-xl text-white/20 hover:text-starGold hover:bg-starGold/5 transition-all"
                onClick={() => { setUserToPurge(user); setIsDeleteModalOpen(true); }}
                title="Delete User"
              >
                <Icon icon="solar:trash-bin-trash-bold-duotone" className="text-lg" />
              </button>
            </div>
          )}
        />
        </div>
      )}

      {/* Edit/Create Modal */}
      <UserModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setSelectedUser(null); }} 
        onSave={handleSaveUser}
        onVerifyUser={handleVerifyUser}
        initialData={selectedUser}
      />

      {/* View User Modal */}
      {viewUser && (
        <ViewUserModal
          isOpen={isViewModalOpen}
          onClose={() => { setIsViewModalOpen(false); setViewUser(null); }}
          user={viewUser}
        />
      )}

      {/* Reusable Delete Modal */}
      <DeleteModal 
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setUserToPurge(null); }}
        onConfirm={handleConfirmPurge}
        title="Delete User"
        itemName={userToPurge?.username}
        description="Are you sure you want to delete this user? This action will suspend their account."
      />
    </div>
  );
};

export default Users;