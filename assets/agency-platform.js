// Design Agency Platform - Alpine.js Store and Utilities
document.addEventListener('alpine:init', () => {
  // Global app store
  Alpine.store('agency', {
    // User state
    user: null,
    userRole: null,
    isAuthenticated: false,
    
    // Request state
    activeRequests: [],
    completedRequests: [],
    draftRequests: [],
    
    // UI state
    notifications: [],
    isLoading: false,
    currentPage: null,
    
    // File upload state
    uploadQueue: [],
    uploadProgress: {},
    
    // Initialize the store
    init() {
      this.user = window.agencyUser || null;
      this.userRole = this.getUserRole();
      this.isAuthenticated = !!this.user;
      this.currentPage = window.location.pathname;
      
      // Load user data if available
      if (this.user) {
        this.loadUserData();
      }
      
      // Set up notification polling
      this.startNotificationPolling();
    },
    
    // Get user role from customer tags
    getUserRole() {
      if (!this.user || !this.user.tags) return null;
      
      const tags = this.user.tags;
      
      if (tags.includes('agency-admin')) return 'admin';
      if (tags.includes('agency-designer')) return 'designer';
      if (tags.includes('agency-account-manager')) return 'account-manager';
      if (tags.includes('client-premium')) return 'client-premium';
      if (tags.includes('client-basic')) return 'client-basic';
      
      return null;
    },
    
    // Check if user has specific role
    hasRole(role) {
      return this.userRole === role;
    },
    
    // Check if user has any of the specified roles
    hasAnyRole(roles) {
      return roles.includes(this.userRole);
    },
    
    // Check if user is agency staff
    isAgencyStaff() {
      return this.hasAnyRole(['admin', 'designer', 'account-manager']);
    },
    
    // Check if user is client
    isClient() {
      return this.hasAnyRole(['client-basic', 'client-premium']);
    },
    
    // Load user data from metafields
    async loadUserData() {
      try {
        this.isLoading = true;
        
        // Load requests data
        const requestsResponse = await fetch('/apps/agency-platform/api/requests');
        if (requestsResponse.ok) {
          const requestsData = await requestsResponse.json();
          this.activeRequests = requestsData.active || [];
          this.completedRequests = requestsData.completed || [];
          this.draftRequests = requestsData.drafts || [];
        }
        
        // Load notifications
        await this.loadNotifications();
        
      } catch (error) {
        console.error('Error loading user data:', error);
        this.addNotification('Error loading data', 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    // Load notifications
    async loadNotifications() {
      try {
        const response = await fetch('/apps/agency-platform/api/notifications');
        if (response.ok) {
          this.notifications = await response.json();
        }
      } catch (error) {
        console.error('Error loading notifications:', error);
      }
    },
    
    // Add notification
    addNotification(message, type = 'info', duration = 5000) {
      const notification = {
        id: Date.now(),
        message,
        type,
        timestamp: new Date(),
        read: false
      };
      
      this.notifications.unshift(notification);
      
      // Auto-remove after duration
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, duration);
    },
    
    // Remove notification
    removeNotification(id) {
      this.notifications = this.notifications.filter(n => n.id !== id);
    },
    
    // Mark notification as read
    markNotificationAsRead(id) {
      const notification = this.notifications.find(n => n.id === id);
      if (notification) {
        notification.read = true;
      }
    },
    
    // Start notification polling
    startNotificationPolling() {
      setInterval(() => {
        if (this.isAuthenticated) {
          this.loadNotifications();
        }
      }, 30000); // Poll every 30 seconds
    },
    
    // Create new request
    async createRequest(requestData) {
      try {
        this.isLoading = true;
        
        const response = await fetch('/apps/agency-platform/api/requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
          const newRequest = await response.json();
          this.activeRequests.unshift(newRequest);
          this.addNotification('Request created successfully', 'success');
          return newRequest;
        } else {
          throw new Error('Failed to create request');
        }
      } catch (error) {
        console.error('Error creating request:', error);
        this.addNotification('Error creating request', 'error');
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    // Update request status
    async updateRequestStatus(requestId, status) {
      try {
        const response = await fetch(`/apps/agency-platform/api/requests/${requestId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status })
        });
        
        if (response.ok) {
          // Update local state
          const request = this.activeRequests.find(r => r.id === requestId) ||
                         this.completedRequests.find(r => r.id === requestId);
          
          if (request) {
            request.status = status;
            
            // Move to appropriate array
            if (status === 'completed') {
              this.activeRequests = this.activeRequests.filter(r => r.id !== requestId);
              this.completedRequests.unshift(request);
            }
          }
          
          this.addNotification('Request status updated', 'success');
        }
      } catch (error) {
        console.error('Error updating request status:', error);
        this.addNotification('Error updating request status', 'error');
      }
    },
    
    // Upload file
    async uploadFile(file, requestId = null) {
      const uploadId = Date.now();
      
      try {
        this.uploadProgress[uploadId] = 0;
        
        const formData = new FormData();
        formData.append('file', file);
        if (requestId) {
          formData.append('requestId', requestId);
        }
        
        const response = await fetch('/apps/agency-platform/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          this.uploadProgress[uploadId] = 100;
          this.addNotification('File uploaded successfully', 'success');
          return result;
        } else {
          throw new Error('Upload failed');
        }
      } catch (error) {
        console.error('Error uploading file:', error);
        this.addNotification('Error uploading file', 'error');
        throw error;
      } finally {
        delete this.uploadProgress[uploadId];
      }
    },
    
    // Get upload progress
    getUploadProgress(uploadId) {
      return this.uploadProgress[uploadId] || 0;
    }
  });
  
  // Request form component
  Alpine.data('requestForm', () => ({
    currentStep: 1,
    totalSteps: 4,
    formData: {
      title: '',
      description: '',
      category: '',
      priority: 'medium',
      deadline: '',
      inspiration: [],
      attachments: []
    },
    errors: {},
    isSubmitting: false,
    
    init() {
      // Load draft if exists
      this.loadDraft();
    },
    
    // Navigation methods
    nextStep() {
      if (this.validateCurrentStep()) {
        this.currentStep = Math.min(this.currentStep + 1, this.totalSteps);
        this.saveDraft();
      }
    },
    
    prevStep() {
      this.currentStep = Math.max(this.currentStep - 1, 1);
    },
    
    // Validation
    validateCurrentStep() {
      this.errors = {};
      
      switch (this.currentStep) {
        case 1:
          if (!this.formData.title.trim()) {
            this.errors.title = 'Title is required';
          }
          if (!this.formData.description.trim()) {
            this.errors.description = 'Description is required';
          }
          break;
        case 2:
          if (!this.formData.category) {
            this.errors.category = 'Category is required';
          }
          break;
        case 3:
          if (!this.formData.deadline) {
            this.errors.deadline = 'Deadline is required';
          }
          break;
      }
      
      return Object.keys(this.errors).length === 0;
    },
    
    // Submit form
    async submitForm() {
      if (!this.validateCurrentStep()) return;
      
      try {
        this.isSubmitting = true;
        
        const request = await Alpine.store('agency').createRequest(this.formData);
        
        // Clear draft
        this.clearDraft();
        
        // Redirect to request details
        window.location.href = `/pages/request-details/${request.id}`;
        
      } catch (error) {
        console.error('Error submitting form:', error);
      } finally {
        this.isSubmitting = false;
      }
    },
    
    // Draft management
    saveDraft() {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('request-draft', JSON.stringify({
          formData: this.formData,
          currentStep: this.currentStep,
          timestamp: Date.now()
        }));
      }
    },
    
    loadDraft() {
      if (typeof localStorage !== 'undefined') {
        const draft = localStorage.getItem('request-draft');
        if (draft) {
          const parsed = JSON.parse(draft);
          // Only load if draft is less than 24 hours old
          if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
            this.formData = parsed.formData;
            this.currentStep = parsed.currentStep;
          }
        }
      }
    },
    
    clearDraft() {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('request-draft');
      }
    },
    
    // File handling
    handleFileUpload(event) {
      const files = Array.from(event.target.files);
      files.forEach(file => {
        this.formData.attachments.push({
          name: file.name,
          size: file.size,
          type: file.type,
          file: file
        });
      });
    },
    
    removeFile(index) {
      this.formData.attachments.splice(index, 1);
    }
  }));
  
  // File uploader component
  Alpine.data('fileUploader', (options = {}) => ({
    files: [],
    isDragging: false,
    uploadProgress: {},
    
    init() {
      this.options = {
        multiple: true,
        maxSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['image/*', 'application/pdf'],
        ...options
      };
    },
    
    // Drag and drop handlers
    handleDragEnter(e) {
      e.preventDefault();
      this.isDragging = true;
    },
    
    handleDragLeave(e) {
      e.preventDefault();
      this.isDragging = false;
    },
    
    handleDrop(e) {
      e.preventDefault();
      this.isDragging = false;
      
      const files = Array.from(e.dataTransfer.files);
      this.addFiles(files);
    },
    
    // File input handler
    handleFileSelect(e) {
      const files = Array.from(e.target.files);
      this.addFiles(files);
    },
    
    // Add files with validation
    addFiles(files) {
      files.forEach(file => {
        if (this.validateFile(file)) {
          this.files.push({
            id: Date.now() + Math.random(),
            file: file,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'pending'
          });
        }
      });
    },
    
    // Validate file
    validateFile(file) {
      // Check file size
      if (file.size > this.options.maxSize) {
        Alpine.store('agency').addNotification(
          `File ${file.name} is too large. Maximum size is ${this.options.maxSize / 1024 / 1024}MB`,
          'error'
        );
        return false;
      }
      
      // Check file type
      const isValidType = this.options.allowedTypes.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.replace('/*', ''));
        }
        return file.type === type;
      });
      
      if (!isValidType) {
        Alpine.store('agency').addNotification(
          `File type ${file.type} is not allowed`,
          'error'
        );
        return false;
      }
      
      return true;
    },
    
    // Remove file
    removeFile(fileId) {
      this.files = this.files.filter(f => f.id !== fileId);
    },
    
    // Upload all files
    async uploadFiles() {
      const uploadPromises = this.files.map(async (fileObj) => {
        try {
          fileObj.status = 'uploading';
          const result = await Alpine.store('agency').uploadFile(fileObj.file);
          fileObj.status = 'completed';
          fileObj.url = result.url;
          return result;
        } catch (error) {
          fileObj.status = 'error';
          throw error;
        }
      });
      
      return Promise.all(uploadPromises);
    }
  }));
  
  // Board manager component
  Alpine.data('boardManager', () => ({
    boards: [],
    currentBoard: null,
    isCreatingBoard: false,
    newBoardName: '',
    
    init() {
      this.loadBoards();
    },
    
    // Load boards from metafields
    async loadBoards() {
      try {
        const response = await fetch('/apps/agency-platform/api/boards');
        if (response.ok) {
          this.boards = await response.json();
        }
      } catch (error) {
        console.error('Error loading boards:', error);
      }
    },
    
    // Create new board
    async createBoard() {
      if (!this.newBoardName.trim()) return;
      
      try {
        const response = await fetch('/apps/agency-platform/api/boards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: this.newBoardName,
            description: ''
          })
        });
        
        if (response.ok) {
          const newBoard = await response.json();
          this.boards.push(newBoard);
          this.newBoardName = '';
          this.isCreatingBoard = false;
          Alpine.store('agency').addNotification('Board created successfully', 'success');
        }
      } catch (error) {
        console.error('Error creating board:', error);
        Alpine.store('agency').addNotification('Error creating board', 'error');
      }
    },
    
    // Delete board
    async deleteBoard(boardId) {
      if (!confirm('Are you sure you want to delete this board?')) return;
      
      try {
        const response = await fetch(`/apps/agency-platform/api/boards/${boardId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          this.boards = this.boards.filter(b => b.id !== boardId);
          Alpine.store('agency').addNotification('Board deleted successfully', 'success');
        }
      } catch (error) {
        console.error('Error deleting board:', error);
        Alpine.store('agency').addNotification('Error deleting board', 'error');
      }
    }
  }));
}); 