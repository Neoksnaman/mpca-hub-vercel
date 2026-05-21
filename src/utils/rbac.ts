import { User, UserRole } from '../types';

/**
 * Determines if a user has permission to view a specific client based on role hierarchy and team.
 * 
 * @param currentUser The currently logged-in user
 * @param clientStaff A Set of strings containing the names/IDs of staff assigned to the client
 * @param allUsers The full list of users in the system (needed for Senior team checking)
 * @returns boolean
 */
export const canViewClient = (currentUser: User | null, clientStaff: Set<string>, allUsers: User[]): boolean => {
    if (!currentUser) return false;

    // Managers, Supervisors, Admins have global visibility
    if (
        currentUser.role === UserRole.MANAGER || 
        currentUser.role === UserRole.SUPERVISOR || 
        currentUser.role === UserRole.ADMIN
    ) {
        return true;
    }

    // Map raw staff strings to user objects
    const assignedUsers = Array.from(clientStaff).map(staffStr => {
        return allUsers.find(u => 
            u.id === staffStr || 
            u.username === staffStr || 
            u.firstName === staffStr || 
            `${u.firstName} ${u.lastName}` === staffStr
        );
    }).filter(Boolean);

    // Direct assignment check
    const isDirectlyAssigned = assignedUsers.some(u => u?.id === currentUser.id);

    if (isDirectlyAssigned) {
        return true;
    }

    // Team visibility check (Seniors only)
    if (currentUser.role === UserRole.SENIOR && currentUser.team) {
        // Check if any of the assigned users are base STAFF members in the Senior's team
        const isTeamAssigned = assignedUsers.some(u => 
            u?.team === currentUser.team &&
            u?.id !== currentUser.id && // exclude themselves
            u?.role !== UserRole.SENIOR &&
            u?.role !== UserRole.MANAGER &&
            u?.role !== UserRole.SUPERVISOR &&
            u?.role !== UserRole.ADMIN
        );
        
        if (isTeamAssigned) {
            return true;
        }
    }

    return false;
};
