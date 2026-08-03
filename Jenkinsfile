pipeline {
    agent any

    environment {
        // Securely pull infrastructure secrets from Jenkins Credentials Store
        // Using 'credentials()' automatically masks these values in build logs!
        AWS_REGION     = credentials('aws-region-secret')
        TARGET_GROUP_ARN = credentials('aws-target-group-arn')   // ARN of your ALB target group
        ECR_REGISTRY   = credentials('aws-ecr-registry-url')
        ECR_REPO       = credentials('aws-ecr-repo-name')
        ECR_REPO_BACKEND = credentials('aws-ecr-repo-name-backend')
        EC2_PRIVATE_IP = credentials('ec2-private-ip-secret')
        EC2_USER       = credentials('ec2-ssh-username')
        
        // Dynamic build tag
        IMAGE_TAG      = "${env.BUILD_NUMBER}"
        CONTAINER_NAME = 'my-running-app'
        PORT_MAPPING   = '80:8080'
    }

    stages {
        stage('1. Checkout Code') {
            steps {
                echo 'Checking out source code from GitHub...'
                checkout scm
            }
        }

        stage('2. Build Docker Images') {
            steps {
                echo 'Building Docker images using Docker Compose...'
                script {
                    // FIXED: Using docker compose to read your backend/frontend folders automatically!
                    // And using triple single-quotes (''') for security.
                     sh '''
echo "Registry length: ${#ECR_REGISTRY}"
echo "Frontend repo length: ${#ECR_REPO}"
echo "Backend repo length: ${#ECR_REPO_BACKEND}"

printf "[%s]\n" "$ECR_REGISTRY"
printf "[%s]\n" "$ECR_REPO"
printf "[%s]\n" "$ECR_REPO_BACKEND"
'''



                    
                    sh '''
                        docker compose build

                         echo "===== Docker Images ====="
            docker image ls

            echo "===== Inspect Frontend ====="
            docker image inspect ${ECR_REGISTRY}/${ECR_REPO}:frontend-${IMAGE_TAG}

            echo "===== Inspect Backend ====="
            docker image inspect ${ECR_REGISTRY}/${ECR_REPO_BACKEND}:backend-${IMAGE_TAG}
                    '''
                }
            }
        }

        stage('3. Push to AWS ECR') {
            steps {
                echo 'Authenticating and pushing image to AWS ECR...'
                // Scoped AWS credential binding for ECR push
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr-credentials',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                   // Because docker-compose.yml now applies the exact remote tags natively 
                    // during 'docker compose build', we just push them directly.
                    sh '''
                        aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
                        docker push $ECR_REGISTRY/${ECR_REPO}:frontend-${IMAGE_TAG}
                        docker push $ECR_REGISTRY/${ECR_REPO_BACKEND}:backend-${IMAGE_TAG}
                        
                    '''
                }
            }
        }

        stage('4. Deploy to Private EC2') {
            steps {
                echo 'Deploying to private EC2 instance...'
                // Scoped SSH agent binding for private key authentication
                sshagent(['ec2-private-ssh-key']) {
                 // 1. Copy the docker-compose file to the EC2 instance
                    sh """
                        scp -o StrictHostKeyChecking=no docker-compose.yml ${EC2_USER}@${EC2_PRIVATE_IP}:/home/${EC2_USER}/docker-compose.yml
                        scp -r -o StrictHostKeyChecking=no postgres ${EC2_USER}@${EC2_PRIVATE_IP}:/home/${EC2_USER}/postgres
                    """
                    
                    // 2. SSH in, pass environment variables, and run docker compose
                    sh """
                        ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_PRIVATE_IP} '
                            aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY} &&
                            
                            # Export variables so remote docker compose can read them
                            export ECR_REGISTRY=${ECR_REGISTRY}
                            export ECR_REPO=${ECR_REPO}
                            export IMAGE_TAG=${IMAGE_TAG}
                            
                            # Pull latest images and restart the stack correctly
                            cd /home/${EC2_USER} &&
                            docker-compose pull &&
                            docker-compose up -d &&
                            docker image prune -f
                        '
                    """
                }
            }
        }

       stage('5. Register with Load Balancer') {
    steps {
        echo "Registering EC2 instance with Load Balancer..."
        sshagent(['ec2-private-ssh-key']) {
            // Using triple double-quotes (""") allows Groovy to inject Jenkins env variables 
            // like ${EC2_USER} while we escape bash variables (\$) to run remotely.
            sh """
                ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_PRIVATE_IP} '
                    # 1. Fetch IMDSv2 token
                    TOKEN=\$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" -s)
                    
                    # 2. Fetch Instance ID using the token
                    INSTANCE_ID=\$(curl -H "X-aws-ec2-metadata-token: \$TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
                    
                    # 3. Register with ALB
                    aws elbv2 register-targets \\
                        --target-group-arn ${TARGET_GROUP_ARN} \\
                        --targets Id=\$INSTANCE_ID
                '
            """
        }
    }
}
     
    }

    post {
        success {
            echo '✅ Pipeline succeeded! Application deployed securely.'
        }
        failure {
            echo '❌ Pipeline failed. Please check the build logs above.'
        }
    }
}
